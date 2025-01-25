// Add config directly
const config = {
    API_URL: 'https://api.deepseek.com/v1/chat/completions',
    API_KEY: 'sk-c14a473181034781817aaf9ff505a2fb',
    MODEL_NAME: 'deepseek-chat',
    MAX_TOKENS: 1000,
    TEMPERATURE: 0.7,
    SYSTEM_PROMPT: `Вы — профессиональный консультант по картинам по номерам в магазине Zvetnoe.ru.
    
    Ваша задача:
    1. Помогать клиентам выбрать подходящие картины по номерам
    2. Отвечать на вопросы о сложности, размерах и материалах
    3. Давать рекомендации с учетом опыта и предпочтений клиента
    
    Правила общения:
    1. Всегда будьте вежливы и профессиональны
    2. Давайте конкретные рекомендации на основе каталога
    3. Если информации недостаточно, задавайте уточняющие вопросы
    4. Используйте формальный стиль общения
    
    При рекомендации товаров учитывайте:
    - Уровень сложности (начинающий/средний/опытный)
    - Тематику (природа/города/животные/etc)
    - Ценовой диапазон
    - Размер картины
    
    Важно: 
    1. Давайте только краткие ответы (1-2 предложения)
    2. Не включайте ссылки и технические детали
    3. Просто опишите, почему эти картины подойдут
    4. Пусть карточки товаров говорят сами за себя`
};

// Add utility functions directly
const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB'
    }).format(price);
};

const sanitizeHTML = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

// Add this new function
const sanitizeProductData = (product) => {
    return {
        ...product,
        name: sanitizeHTML(product.name),
        description: sanitizeHTML(product.description),
        category: sanitizeHTML(product.category),
        url: sanitizeHTML(product.url),
        picture: sanitizeHTML(product.picture)
    };
};

class AIService {
    constructor() {
        this.apiUrl = config.API_URL;
        this.apiKey = config.API_KEY;
    }

    async generateResponse(messages) {
        try {
            console.log('Sending request to:', this.apiUrl);
            const response = await axios.post(this.apiUrl, {
                model: config.MODEL_NAME,
                messages: [
                    {
                        role: 'system',
                        content: `${config.SYSTEM_PROMPT}
                        Важно: Давайте короткие ответы (1-2 предложения) и позвольте товарам говорить за себя.`
                    },
                    ...messages
                ],
                stream: false,
                max_tokens: config.MAX_TOKENS,
                temperature: config.TEMPERATURE
            }, {
                headers: {
                    'Authorization': `Bearer ${config.API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.data || !response.data.choices || !response.data.choices[0]) {
                console.error('Invalid API response:', response);
                throw new Error('Invalid response from AI service');
            }

            return response.data.choices[0].message.content;
        } catch (error) {
            console.error('AI Service Error:', error);
            if (error.response) {
                console.error('API Response:', error.response.data);
                const errorMessage = error.response.data.error?.message || 'Unknown error';
                throw new Error(`API Error: ${errorMessage}`);
            }
            throw new Error('Failed to connect to AI service: ' + (error.message || 'Unknown error'));
        }
    }
}

class ProductCatalog {
    constructor() {
        this.products = [];
        this.categories = new Set();
        this.priceRange = { min: Infinity, max: -Infinity };
    }

    async loadFromXML(url) {
        try {
            const response = await axios.get(url);
            if (!response.data) {
                throw new Error('No data received from XML endpoint');
            }

            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(response.data, "text/xml");
            
            const offers = xmlDoc.getElementsByTagName('offer');
            if (!offers || offers.length === 0) {
                throw new Error('No products found in XML');
            }
            
            for (let offer of offers) {
                try {
                    const product = {
                        id: offer.getAttribute('id'),
                        name: this.getElementText(offer, 'name') || 'Картина по номерам',
                        price: parseFloat(this.getElementText(offer, 'price')),
                        category: this.getElementText(offer, 'category') || 'Разное',
                        description: this.getElementText(offer, 'description'),
                        picture: this.getElementText(offer, 'picture'),
                        url: this.getElementText(offer, 'url')
                    };
                    
                    // Validate required fields
                    if (!product.price || isNaN(product.price)) {
                        console.warn('Skipping product with invalid price:', product);
                        continue;
                    }
                    
                    // Clean up description HTML
                    product.description = product.description
                        .replace(/<\/?[^>]+(>|$)/g, '') // Remove HTML tags
                        .replace(/\s+/g, ' ')           // Normalize whitespace
                        .trim();
                    
                    // Sanitize data before storing
                    const sanitizedProduct = sanitizeProductData(product);
                    this.products.push(sanitizedProduct);
                    this.categories.add(sanitizedProduct.category);
                    this.priceRange.min = Math.min(this.priceRange.min, sanitizedProduct.price);
                    this.priceRange.max = Math.max(this.priceRange.max, sanitizedProduct.price);
                } catch (err) {
                    console.warn('Error processing product:', err);
                    continue;
                }
            }

            console.log(`Loaded ${this.products.length} products successfully`);
            console.log('Categories:', Array.from(this.categories));
            console.log('Price range:', this.priceRange);

            if (this.products.length === 0) {
                throw new Error('No valid products loaded from XML');
            }
        } catch (error) {
            console.error('Error loading catalog:', error);
            throw error;
        }
    }

    getElementText(element, tagName) {
        const node = element.getElementsByTagName(tagName)[0];
        return node ? node.textContent : '';
    }

    searchProducts(query) {
        const searchTerms = query.toLowerCase().split(' ');
        const results = this.products.map(product => {
            const searchText = `${product.name} ${product.description} ${product.category}`.toLowerCase();
            const matchScore = searchTerms.reduce((score, term) => {
                if (searchText.includes(term)) {
                    score += 1;
                    // Bonus points for matches in name or category
                    if (product.name.toLowerCase().includes(term)) score += 2;
                    if (product.category.toLowerCase().includes(term)) score += 1;
                }
                return score;
            }, 0);
            return { product, score: matchScore };
        });

        // Sort by score and return only products with matches
        return results
            .filter(result => result.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(result => result.product);
    }

    getProductsByCategory(category) {
        return this.products.filter(product => product.category === category);
    }

    getProductsByPriceRange(min, max) {
        return this.products.filter(product => 
            product.price >= min && product.price <= max
        );
    }

    generateProductPrompt(products) {
        if (!products.length) return 'Нет подходящих товаров в каталоге.';

        return `Доступные товары:\n\n${products.map(p => `
Название: ${p.name}
Цена: ${formatPrice(p.price)}
Категория: ${p.category}
Описание: ${p.description}
URL: ${p.url}
---`).join('\n')}`;
    }

    categorizeByPrice(products) {
        return {
            budget: products.filter(p => p.price < 1000),
            medium: products.filter(p => p.price >= 1000 && p.price < 2000),
            premium: products.filter(p => p.price >= 2000)
        };
    }
}

class SimpleChat {
    constructor() {
        this.messages = document.getElementById('chatMessages');
        this.input = document.getElementById('userInput');
        this.button = document.getElementById('sendMessage');
        
        // Initialize AI service and catalog
        this.aiService = new AIService();
        this.catalog = new ProductCatalog();
        this.context = [];
        
        // Bind event listeners
        this.button.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });

        // Load catalog
        this.initializeCatalog();
    }

    async initializeCatalog() {
        try {
            await this.catalog.loadFromXML('./yml_spodial.xml');
            console.log('Catalog loaded successfully');
        } catch (error) {
            console.error('Failed to load catalog:', error);
            this.addMessage('Извините, не удалось загрузить каталог товаров.', false);
        }
    }

    async sendMessage() {
        const message = this.input.value.trim();
        if (!message) return;

        // Add user message
        this.addMessage(message, true);
        this.input.value = '';
        
        try {
            this.button.disabled = true;
            
            // Add message to context
            this.context.push({ role: 'user', content: message });
            
            // Get relevant products
            const relevantProducts = this.catalog.searchProducts(message);
            const productContext = this.catalog.generateProductPrompt(relevantProducts.slice(0, 5));
            
            // Add product context to the message
            this.context.push({
                role: 'system',
                content: `Актуальные товары для запроса:\n${productContext}`
            });

            // Get AI response
            const response = await this.aiService.generateResponse(this.context);
            
            // Add AI response to context and display it
            this.context.push({ role: 'assistant', content: response });
            this.addMessage(response, false);

        } catch (error) {
            console.error('Chat error:', error);
            this.addMessage('Извините, произошла ошибка. Попробуйте позже.', false);
        } finally {
            this.button.disabled = false;
        }
    }

    addMessage(text, isUser) {
        const div = document.createElement('div');
        div.className = `message ${isUser ? 'user' : 'assistant'}`;
        
        if (!isUser) {
            // First add the text response
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            
            // Convert markdown formatting
            text = text.replace(/###\s(.*?)(?=\n|$)/g, '<h3>$1</h3>');
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
            text = text.replace(/- (.*?)(?=\n|$)/g, '<li>$1</li>');
            if (text.includes('<li>')) {
                text = text.replace(/(<li>.*?<\/li>)\n*/g, '<ul>$1</ul>');
            }
            text = text.replace(/\n/g, '<br>');
            
            textDiv.innerHTML = text;
            div.appendChild(textDiv);

            // Add product cards if there are relevant products
            const relevantProducts = this.catalog.searchProducts(this.context[this.context.length - 2]?.content || '');
            if (relevantProducts.length > 0) {
                const productsDiv = document.createElement('div');
                productsDiv.className = 'product-cards';
                
                relevantProducts.slice(0, 4).forEach(product => {
                    const card = document.createElement('div');
                    card.className = 'product-card';
                    card.innerHTML = `
                        ${product.picture ? `<img src="${product.picture}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/200'">` : ''}
                        <div class="product-card-content">
                            <h4>${product.model || product.name.replace('Картина по номерам ', '')}</h4>
                            <button class="buy-button">Купить за ${formatPrice(product.price)}</button>
                        </div>
                    `;
                    
                    // Update click handler to handle both card and button clicks
                    const buyButton = card.querySelector('.buy-button');
                    buyButton.addEventListener('click', (e) => {
                        e.stopPropagation(); // Prevent card click
                        if (window.Telegram?.WebApp?.openTelegramLink) {
                            window.Telegram.WebApp.openTelegramLink(product.url);
                        } else {
                            window.open(product.url, '_blank');
                        }
                    });
                    
                    productsDiv.appendChild(card);
                });
                
                div.appendChild(productsDiv);
            }

            // After product cards, add the question
            const questionDiv = document.createElement('div');
            questionDiv.className = 'message-text';
            questionDiv.innerHTML = '<br>Какой вариант вам больше нравится?';
            div.appendChild(questionDiv);
        } else {
            div.textContent = text;
        }
        
        this.messages.appendChild(div);
        this.messages.scrollTop = this.messages.scrollHeight;
    }
}

// Initialize chat when page loads
document.addEventListener('DOMContentLoaded', () => {
    const chat = new SimpleChat();
});