export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
};

export const sanitizeHTML = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

export const formatPrice = (price) => {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB'
    }).format(price);
};

export const rateLimit = (func, limit) => {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
};

export const cache = new Map();

export const cacheWithExpiry = (key, value, ttl = 3600000) => {
    const item = {
        value,
        expiry: Date.now() + ttl
    };
    cache.set(key, item);
};

export const getCachedValue = (key) => {
    const item = cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiry) {
        cache.delete(key);
        return null;
    }
    
    return item.value;
};

export const sanitizeProductData = (product) => {
    return {
        ...product,
        name: sanitizeHTML(product.name),
        description: sanitizeHTML(product.description),
        category: sanitizeHTML(product.category),
        url: sanitizeHTML(product.url),
        picture: sanitizeHTML(product.picture)
    };
}; 