// Add config directly
const config = {
    API_URL: 'https://api.deepseek.com/v1/chat/completions',
    API_KEY: 'sk-c14a473181034781817aaf9ff505a2fb',
    MODEL_NAME: 'deepseek-chat',
    MAX_TOKENS: 1000,
    TEMPERATURE: 0.7,
    SYSTEM_PROMPT: `Вы — профессиональный консультант по картинам по номерам.
    
    Важно: 
    1. Давайте краткие рекомендации
    2. После описания каждой картины добавляйте её артикул в скобках (ID: 12345)
    3. После рекомендаций спрашивайте мнение клиента
    
    Пример ответа:
    Для вас подойдет картина "Закат в Париже" - романтичный городской пейзаж (ID: 12345).`
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

    searchProducts(ids) {
        console.log('Searching for IDs:', ids);
        
        // Ищем товары по ID
        const found = this.products.filter(product => 
            ids.includes(product.id)
        );
        
        console.log('Found products:', found.length);
        return found;
    }

    generateProductPrompt(products) {
        if (!products.length) return 'Нет подходящих товаров в каталоге.';

        return `Доступные товары:\n\n${products.map(p => {
            return `
ID: ${p.id}
Название: ${p.name}
Цена: ${formatPrice(p.price)}
Категория: ${p.category}
Теги: ${p.tags.join(', ')}
---`;
        }).join('\n')}`;
    }
}

class SimpleChat {
    constructor() {
        this.messages = document.getElementById('chatMessages');
        this.input = document.getElementById('userInput');
        this.button = document.getElementById('sendMessage');
        
        // Initialize services
        this.aiService = new AIService();
        this.catalog = new ProductCatalog();
        this.context = [];
        
        // Создаем блок рекомендаций
        this.recommendationsDiv = document.createElement('div');
        this.recommendationsDiv.className = 'recommendations';
        this.recommendationsDiv.innerHTML = '<h3>Наши рекомендации</h3>';
        this.messages.parentNode.insertBefore(this.recommendationsDiv, this.messages);
        
        // Bind event listeners
        this.button.addEventListener('click', () => this.sendMessage());
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        // Инициализируем в правильном порядке
        this.initialize();
    }

    async initialize() {
        try {
            // Сначала загружаем каталог
            await this.catalog.loadFromXML('./yml_spodial.xml');
            console.log('Catalog loaded successfully');
            
            // После загрузки каталога показываем рекомендации
            this.updateRecommendations();
            
            // И запускаем автообновление
            setInterval(() => this.updateRecommendations(), 5 * 60 * 1000);
        } catch (error) {
            console.error('Failed to initialize:', error);
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
            
            // Сначала найдем подходящие товары для контекста
            const relevantProducts = this.catalog.products.slice(0, 5); // Временно берем первые 5 товаров
            const productContext = this.catalog.generateProductPrompt(relevantProducts);
            
            // Добавляем контекст с товарами для AI
            this.context.push({
                role: 'system',
                content: `${productContext}\nИспользуйте ID из списка выше при рекомендации товаров.`
            });

            const response = await this.aiService.generateResponse(this.context);
            console.log('Original AI response:', response);
            
            // Ищем ID товаров в ответе (формат: ID: 12345)
            const ids = response.match(/ID:\s*(\d+)/g)?.map(match => 
                match.replace('ID:', '').trim()
            ) || [];
            console.log('Found IDs:', ids);
            
            // Находим товары по ID
            this.lastRelevantProducts = this.catalog.searchProducts(ids);
            
            // Удаляем ID из текста ответа
            const cleanResponse = response.replace(/\(ID:\s*\d+\)/g, '');
            
            this.context.push({ role: 'assistant', content: cleanResponse });
            this.addMessage(cleanResponse, false);
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
            const textDiv = document.createElement('div');
            textDiv.className = 'message-text';
            textDiv.innerHTML = this.formatText(text);
            div.appendChild(textDiv);

            if (this.lastRelevantProducts?.length > 0) {
                const productsDiv = document.createElement('div');
                productsDiv.className = 'product-cards';
                this.addProductCards(productsDiv, this.lastRelevantProducts);
                div.appendChild(productsDiv);
            }
        } else {
            div.textContent = text;
        }
        
        this.messages.appendChild(div);
        this.messages.scrollTop = this.messages.scrollHeight;
    }

    // Вспомогательный метод для создания карточек
    addProductCards(container, products) {
        products.forEach(product => {
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
            
            const buyButton = card.querySelector('.buy-button');
            buyButton.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open(product.url, '_blank');
            });
            
            container.appendChild(card);
        });
    }

    // Добавляем вспомогательный метод для форматирования текста
    formatText(text) {
        return text
            .replace(/###\s(.*?)(?=\n|$)/g, '<h3>$1</h3>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    updateRecommendations() {
        console.log('Updating recommendations, products available:', this.catalog.products.length);
        
        // Получаем 6 случайных картин
        const recommendations = this.getRandomProducts(6);
        console.log('Selected recommendations:', recommendations.map(p => p.name));
        
        // Создаем обертку для слайдера
        const wrapper = document.createElement('div');
        wrapper.className = 'recommendations-wrapper';
        
        // Создаем контейнер для карточек
        const cardsContainer = document.createElement('div');
        cardsContainer.className = 'product-cards recommendations-cards';
        
        // Добавляем карточки
        this.addProductCards(cardsContainer, recommendations);
        
        // Создаем индикаторы
        const indicators = document.createElement('div');
        indicators.className = 'scroll-indicators';
        
        // Добавляем точки (3 точки для 6 картин)
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'scroll-dot' + (i === 0 ? ' active' : '');
            indicators.appendChild(dot);
        }
        
        // Добавляем слушатель прокрутки
        cardsContainer.addEventListener('scroll', () => {
            const scrollPosition = cardsContainer.scrollLeft;
            const maxScroll = cardsContainer.scrollWidth - cardsContainer.clientWidth;
            const progress = scrollPosition / maxScroll;
            
            // Обновляем активную точку
            const dots = indicators.children;
            const activeDotIndex = Math.round(progress * 2);
            
            Array.from(dots).forEach((dot, index) => {
                dot.classList.toggle('active', index === activeDotIndex);
            });
        });
        
        // Собираем все вместе
        wrapper.appendChild(cardsContainer);
        wrapper.appendChild(indicators);
        
        // Обновляем содержимое блока рекомендаций
        this.recommendationsDiv.innerHTML = '<h3>Наши рекомендации</h3>';
        this.recommendationsDiv.appendChild(wrapper);
    }

    getRandomProducts(count) {
        const shuffled = [...this.catalog.products].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, count);
    }
}

// Initialize chat when page loads
document.addEventListener('DOMContentLoaded', () => {
    const chat = new SimpleChat();
});

// Обновляем placeholder
const userInput = document.getElementById('userInput');
userInput.placeholder = 'Опишите желаемую картину...';