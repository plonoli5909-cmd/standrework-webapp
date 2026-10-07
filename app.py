import asyncio
import logging
import os

import aiosqlite
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, CommandObject
from aiogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    WebAppInfo,
)
from aiogram.utils.web_app import safe_parse_webapp_init_data
from aiohttp import web
from dotenv import load_dotenv

# ============ НАСТРОЙКИ ============
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


# ============ БАЗА ДАННЫХ ============
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
        await db.execute(
            "UPDATE users SET balance = balance + ? WHERE user_id = ?",
            (amount, user_id),
        )
        await db.commit()


async def add_referral_count(user_id: int):
    async with aiosqlite.connect(DB_NAME) as db:
        await db.execute(
            "UPDATE users SET referrals_count = referrals_count + 1 WHERE user_id = ?",
            (user_id,),
        )
        await db.commit()


async def get_balance(user_id: int) -> int:
    user = await get_user(user_id)
    return user[2] if user else 0


# ============ КЛАВИАТУРЫ ============
def subscribe_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="📢 Подписаться на канал", url="https://t.me/pricedares")],
        [InlineKeyboardButton(text="🎮 Канал игры", url="https://t.me/pricedares")],
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
        # Если не можем проверить — пускаем (чтобы бот не молчал)
        return True


# ============ /start С РЕФ-ССЫЛКОЙ ============
@dp.message(CommandStart(deep_link=True))
async def start_ref(message: Message, command: CommandObject):
    user_id = message.from_user.id
    referrer_id = None

    if command.args and command.args.isdigit():
        referrer_id = int(command.args)

    if referrer_id == user_id:
        referrer_id = None

    if not await check_subscription(user_id):
        await message.answer(
            f"Привет, {message.from_user.full_name}!\n\n"
            f"Чтобы пользоваться ботом, подпишись на каналы ниже:\n\n"
            f"{PRODUCTION_SIGN}",
            reply_markup=subscribe_keyboard(),
        )
        return

    existing = await get_user(user_id)
    is_new = existing is None

    await add_user(user_id, message.from_user.username, referrer_id)

    if referrer_id and is_new:
        await add_balance(referrer_id, REFERRAL_REWARD)
        await add_referral_count(referrer_id)
        try:
            await bot.send_message(
                referrer_id,
                f"🎉 По твоей ссылке зашёл новый игрок!\n"
                f"Начислено: +{REFERRAL_REWARD} голды",
            )
        except Exception as e:
            logging.warning(f"Не смог отправить сообщение рефереру: {e}")

    await message.answer(
        f"Добро пожаловать, {message.from_user.full_name}!\n\n"
        f"Твой баланс: {await get_balance(user_id)} голды\n\n"
        f"{PRODUCTION_SIGN}",
        reply_markup=main_menu(),
    )


# ============ /start БЕЗ ССЫЛКИ ============
@dp.message(CommandStart())
async def start_plain(message: Message):
    user_id = message.from_user.id

    if not await check_subscription(user_id):
        await message.answer(
            f"Привет, {message.from_user.full_name}!\n\n"
            f"Чтобы пользоваться ботом, подпишись на каналы ниже:\n\n"
            f"{PRODUCTION_SIGN}",
            reply_markup=subscribe_keyboard(),
        )
        return

    await add_user(user_id, message.from_user.username)

    await message.answer(
        f"Добро пожаловать, {message.from_user.full_name}!\n\n"
        f"Твой баланс: {await get_balance(user_id)} голды\n\n"
        f"{PRODUCTION_SIGN}",
        reply_markup=main_menu(),
    )


# ============ КОЛБЭКИ ============
@dp.callback_query(lambda c: c.data == "check_sub")
async def cb_check_sub(callback: CallbackQuery):
    user_id = callback.from_user.id

    if await check_subscription(user_id):
        await add_user(user_id, callback.from_user.username)
        await callback.message.edit_text(
            f"✅ Подписка подтверждена!\n\n"
            f"Твой баланс: {await get_balance(user_id)} голды\n\n"
            f"{PRODUCTION_SIGN}",
            reply_markup=main_menu(),
        )
    else:
        await callback.answer("Ты ещё не подписался на все каналы!", show_alert=True)

    await callback.answer()


@dp.callback_query(lambda c: c.data == "profile")
async def cb_profile(callback: CallbackQuery):
    user = await get_user(callback.from_user.id)

    if user:
        text = (
            f"👤 Профиль\n\n"
            f"ID: {user[0]}\n"
            f"Баланс: {user[2]} голды\n"
            f"Рефералов: {user[4]}\n\n"
            f"{PRODUCTION_SIGN}"
        )
    else:
        text = "Ты ещё не зарегистрирован. Напиши /start."

    await callback.message.edit_text(text, reply_markup=main_menu())
    await callback.answer()


@dp.callback_query(lambda c: c.data == "ref_link")
async def cb_ref_link(callback: CallbackQuery):
    user_id = callback.from_user.id
    me = await bot.get_me()
    link = f"https://t.me/{me.username}?start={user_id}"

    text = (
        f"🔗 Твоя реферальная ссылка:\n\n"
        f"{link}\n\n"
        f"За каждого друга ты получаешь {REFERRAL_REWARD} голды.\n\n"
        f"{PRODUCTION_SIGN}"
    )
    await callback.message.edit_text(text, reply_markup=main_menu())
    await callback.answer()


@dp.callback_query(lambda c: c.data == "about")
async def cb_about(callback: CallbackQuery):
    text = (
        f"ℹ️ О проекте\n\n"
        f"Hunter Project / StandRework\n"
        f"Реферальная система с наградой за друзей.\n\n"
        f"{PRODUCTION_SIGN}"
    )
    await callback.message.edit_text(text, reply_markup=main_menu())
    await callback.answer()


# ============ FALLBACK ============
@dp.message()
async def fallback(message: Message):
    await message.answer(
        "Я тебя не понял. Напиши /start, чтобы начать.\n\n"
        f"{PRODUCTION_SIGN}"
    )


# ============ ВЕБ-СЕРВЕР ДЛЯ WEBAPP ============
async def webapp_get_balance(request: web.Request):
    try:
        data = await request.post()
        init_data = data.get("_auth")

        if not init_data:
            return web.json_response({"ok": False, "err": "No init data"}, status=400)

        parsed = safe_parse_webapp_init_data(token=BOT_TOKEN, init_data=init_data)
        user_id = parsed.user.id

        balance = await get_balance(user_id)
        user = await get_user(user_id)
        refs = user[4] if user else 0

        return web.json_response({
            "ok": True,
            "balance": balance,
            "referrals": refs,
        })
    except Exception as e:
        logging.error(f"WebApp error: {e}")
        return web.json_response({"ok": False, "err": str(e)}, status=401)


async def webapp_index(request: web.Request):
    return web.Response(
        text="Bot is running",
        content_type="text/plain",
    )


async def start_webapp_server():
    app = web.Application()
    app.router.add_get("/", webapp_index)
    app.router.add_post("/api/balance", webapp_get_balance)

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
        start_webapp_server(),
    )


if __name__ == "__main__":
    asyncio.run(main())
