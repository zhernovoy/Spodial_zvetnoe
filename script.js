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

    getElementText(element, tagName) {
        const node = element.getElementsByTagName(tagName)[0];
        return node ? node.textContent : '';
    }

    // Добавляем метод для получения тегов
    getElementTags(element) {
        const params = element.getElementsByTagName('param');
        for (let param of params) {
            if (param.getAttribute('name') === 'tags') {
                return param.textContent.split(',').map(tag => tag.trim());
            }
        }
        return [];
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
                        model: this.getElementText(offer, 'model') || '',
                        price: parseFloat(this.getElementText(offer, 'price')),
                        category: this.getElementText(offer, 'category') || 'Разное',
                        description: this.getElementText(offer, 'description'),
                        picture: this.getElementText(offer, 'picture'),
                        url: this.getElementText(offer, 'url'),
                        tags: this.getElementTags(offer) // Добавляем теги
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

    searchProducts(query, context = []) {
        // Анализируем весь контекст диалога
        const fullContext = context.filter(msg => msg.role === 'user')
            .map(msg => msg.content)
            .join(' ')
            .toLowerCase();

        // Извлекаем ключевые параметры из контекста
        const params = {
            experience: this.detectExperience(fullContext),
            age: this.detectAge(fullContext),
            purpose: this.detectPurpose(fullContext),
            theme: this.detectTheme(fullContext),
            priceRange: this.detectPriceRange(fullContext)
        };

        const searchTerms = query.toLowerCase().split(' ');
        
        return this.products
            .map(product => {
                let score = 0;
                
                // Базовое соответствие поисковым терминам
                searchTerms.forEach(term => {
                    const searchText = `${product.name} ${product.description} ${product.category} ${product.tags.join(' ')}`.toLowerCase();
                    if (searchText.includes(term)) score += 1;
                });

                // Соответствие тегам по уровню сложности
                if (params.experience) {
                    if (params.experience === 'beginner' && product.tags.some(tag => 
                        ['простой', 'для начинающих', 'легкий'].includes(tag))) {
                        score += 5;
                    }
                    if (params.experience === 'advanced' && product.tags.some(tag => 
                        ['сложный', 'детальный', 'для опытных'].includes(tag))) {
                        score += 5;
                    }
                }

                // Соответствие возрасту
                if (params.age) {
                    if (params.age < 12 && product.tags.some(tag => 
                        ['детский', 'для детей', 'простой'].includes(tag))) {
                        score += 5;
                    }
                    if (params.age >= 12 && product.tags.some(tag => 
                        ['взрослый', 'сложный'].includes(tag))) {
                        score += 3;
                    }
                }

                // Соответствие цели (подарок/для себя)
                if (params.purpose === 'gift' && product.tags.some(tag => 
                    ['подарок', 'праздничный', 'популярный'].includes(tag))) {
                    score += 4;
                }

                // Соответствие тематике
                if (params.theme && product.tags.some(tag => tag.includes(params.theme))) {
                    score += 5;
                }

                // Соответствие ценовому диапазону
                if (params.priceRange) {
                    if (product.price >= params.priceRange.min && 
                        product.price <= params.priceRange.max) {
                        score += 3;
                    }
                }

                return { product, score };
            })
            .filter(result => result.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(result => result.product);
    }

    // Вспомогательные методы для анализа контекста
    detectExperience(context) {
        if (context.includes('начинающ') || context.includes('первый раз')) return 'beginner';
        if (context.includes('опыт') || context.includes('сложн')) return 'advanced';
        return null;
    }

    detectAge(context) {
        const ageMatch = context.match(/\d+ (?:лет|год)/);
        return ageMatch ? parseInt(ageMatch[0]) : null;
    }

    detectPurpose(context) {
        if (context.includes('подарок') || context.includes('подарить')) return 'gift';
        return 'personal';
    }

    detectTheme(context) {
        const themes = ['природа', 'город', 'животные', 'цветы', 'пейзаж', 'море'];
        return themes.find(theme => context.includes(theme)) || null;
    }

    detectPriceRange(context) {
        const priceMatch = context.match(/до (\d+)/);
        if (priceMatch) {
            return { min: 0, max: parseInt(priceMatch[1]) };
        }
        return null;
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
Теги: ${p.tags.join(', ')}
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

        this.addMessage(message, true);
        this.input.value = '';
        
        try {
            this.button.disabled = true;
            this.context.push({ role: 'user', content: message });
            
            // Передаем весь контекст диалога в поиск
            const relevantProducts = this.catalog.searchProducts(message, this.context);
            const productContext = this.catalog.generateProductPrompt(relevantProducts.slice(0, 4));
            
            this.context.push({
                role: 'system',
                content: `Актуальные товары для запроса:\n${productContext}\n
                Учитывайте контекст диалога и особенности запроса пользователя.
                Если это подарок - упомяните это в ответе.
                Если указан возраст - учтите его при рекомендации.
                Если есть опыт - подчеркните сложность картин.`
            });

            const response = await this.aiService.generateResponse(this.context);
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
            const relevantProducts = this.catalog.searchProducts(this.context[this.context.length - 2]?.content || '', this.context);
            if (relevantProducts.length > 0) {
                const productsDiv = document.createElement('div');
                productsDiv.className = 'product-cards';
                
                relevantProducts.slice(0, 4).forEach(product => {
                    const card = document.createElement('div');
                    card.className = 'product-card';
                    card.innerHTML = `
                        ${product.picture ? `<img src="${product.picture}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/200'">` : ''}
                        <div class="product-card-content">
                            <h4>${product.model || product.name.replace(/Картина по номерам\s*/, '')}</h4>
                            <p class="price">${formatPrice(product.price)}</p>
                            <button class="buy-button">Купить</button>
                        </div>
                    `;
                    
                    // Update click handler to handle both card and button clicks
                    const buyButton = card.querySelector('.buy-button');
                    buyButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Всегда открываем в новом окне
                        window.open(product.url, '_blank');
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