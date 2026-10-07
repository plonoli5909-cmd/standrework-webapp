import asyncio
import logging
import os
from threading import Thread

import aiosqlite
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import (
    Message, CallbackQuery, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
)
from aiohttp import web
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
CHANNEL_ID = os.getenv("CHANNEL_ID")
GAME_CHANNEL_ID = os.getenv("GAME_CHANNEL_ID")
REFERRAL_REWARD = 1000
PRODUCTION_SIGN = "by dark, by amirzov production"
WEBAPP_URL = "https://plonoli5909-cmd.github.io/standrework-webapp/"
DB_NAME = "referals.db"

logging.basicConfig(level=logging.INFO)
bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

# ============ БАЗА ДАННЫХ (как в bot.py) ============
async def init_db():
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                balance INTEGER DEFAULT 0,
                referrer_id INTEGER,
                referrals_count INTEGER DEFAULT 0
            )
        """)
        await db.commit()

async def get_user(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        cursor = await db.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        return await cursor.fetchone()

async def add_user(user_id: int, username: str, referrer_id=None):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute(
            "INSERT OR IGNORE INTO users (user_id, username, referrer_id) VALUES (?, ?, ?)",
            (user_id, username, referrer_id),
        )
        await db.commit()

async def add_balance(user_id: int, amount: int):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("UPDATE users SET balance = balance + ? WHERE user_id = ?", (amount, user_id))
        await db.commit()

async def add_referral_count(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute("UPDATE users SET referrals_count = referrals_count + 1 WHERE user_id = ?", (user_id,))
        await db.commit()

async def get_balance(user_id: int) -> int:
    user = await get_user(user_id)
    return user[2] if user else 0

# ============ КЛАВИАТУРЫ ============
def subscribe_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📢 Подписаться на канал", url="https://t.me/твой_канал")],
        [InlineKeyboardButton(text="🎮 Канал игры", url="https://t.me/канал_игры")],
        [InlineKeyboardButton(text="✅ Я подписался", callback_data="check_sub")],
    ])

def main_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="👤 Профиль", callback_data="profile")],
        [InlineKeyboardButton(text="🔗 Моя реф-ссылка", callback_data="ref_link")],
        [InlineKeyboardButton(text="🎮 Открыть WebApp", web_app=WebAppInfo(url=WEBAPP_URL))],
        [InlineKeyboardButton(text="ℹ️ О проекте", callback_data="about")],
    ])

# ============ ПРОВЕРКА ПОДПИСКИ ============
async def check_subscription(user_id: int) -> bool:
    try:
        member_main = await bot.get_chat_member(chat_id=CHANNEL_ID, user_id=user_id)
        member_game = await bot.get_chat_member(chat_id=GAME_CHANNEL_ID, user_id=user_id)
        ok = ["member", "administrator", "creator"]
        return member_main.status in ok and member_game.status in ok
    except Exception as e:
        logging.warning(f"check_subscription error: {e}")
        return False

# ============ ХЕНДЛЕРЫ БОТА (как в bot.py) ============
@dp.message(CommandStart(deep_link=True))
async def start_ref(message: Message, command: CommandObject):
    # ... (код из твоего bot.py)
    pass

@dp.message(CommandStart())
async def start_plain(message: Message):
    # ... (код из твоего bot.py)
    pass

@dp.callback_query(lambda c: c.data == "check_sub")
async def cb_check_sub(callback: CallbackQuery):
    # ... (код из твоего bot.py)
    pass

@dp.callback_query(lambda c: c.data == "profile")
async def cb_profile(callback: CallbackQuery):
    # ... (код из твоего bot.py)
    pass

@dp.callback_query(lambda c: c.data == "ref_link")
async def cb_ref_link(callback: CallbackQuery):
    # ... (код из твоего bot.py)
    pass

@dp.callback_query(lambda c: c.data == "about")
async def cb_about(callback: CallbackQuery):
    # ... (код из твоего bot.py)
    pass

@dp.message()
async def fallback(message: Message):
    # ... (код из твоего bot.py)
    pass

# ============ ВЕБ-СЕРВЕР (НОВОЕ) ============
async def webapp_get_balance(request: web.Request):
    try:
        data = await request.post()
        init_data = data.get("_auth")
        if not init_data:
            return web.json_response({"ok": False, "err": "No init data"}, status=400)
        
        # Валидация initData (используем aiogram)
        from aiogram.utils.web_app import safe_parse_webapp_init_data
        parsed = safe_parse_webapp_init_data(token=BOT_TOKEN, init_data=init_data)
        user_id = parsed.user.id
        
        balance = await get_balance(user_id)
        user = await get_user(user_id)
        refs = user[4] if user else 0
        
        return web.json_response({"ok": True, "balance": balance, "referrals": refs})
    except Exception as e:
        logging.error(f"WebApp error: {e}")
        return web.json_response({"ok": False, "err": str(e)}, status=401)

async def start_webapp_server():
    app = web.Application()
    app.router.add_post("/api/balance", webapp_get_balance)
    app.router.add_get("/", lambda r: web.Response(text="Bot is running"))
    
    runner = web.AppRunner(app)
    await runner.setup()
    port = int(os.environ.get("PORT", 8080))
    site = web.TCPSite(runner, "0.0.0.0", port)
    await site.start()
    print(f"WebApp API запущен на порту {port}")

# ============ ЗАПУСК ============
async def main():
    await init_db()
    print("Бот запущен...")
    await asyncio.gather(
        dp.start_polling(bot),
        start_webapp_server()
    )

if __name__ == "__main__":
    asyncio.run(main())