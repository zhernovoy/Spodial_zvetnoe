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
    `,
    TELEGRAM_BOT_TOKEN: 'YOUR_BOT_TOKEN',
    TELEGRAM_WEB_APP_NAME: 'zvetnoe_ai_bot'
};

// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand(); // Expand to full height

// Set theme
document.body.style.backgroundColor = tg.backgroundColor;
document.body.style.color = tg.textColor;

export default config; 