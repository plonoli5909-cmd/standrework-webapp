"""
Проверка подписи Telegram WebApp initData.

Использование:

    from verify_init_data import verify_init_data, extract_user

    user = verify_init_data(init_data_str, BOT_TOKEN)
    if not user:
        raise HTTPException(401, "Invalid initData")
    tg_id = user["id"]

Возвращает dict пользователя (id, username, first_name, ...) или None.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Optional, Dict, Any
from urllib.parse import parse_qsl


def _build_data_check_string(pairs: list[tuple[str, str]]) -> str:
    return "\n".join(f"{k}={v}" for k, v in sorted(pairs, key=lambda x: x[0]))


def verify_init_data(
    init_data: str,
    bot_token: str,
    *,
    max_age_seconds: Optional[int] = 86400,
) -> Optional[Dict[str, Any]]:
    """
    Проверяет подпись Telegram WebApp initData.

    :param init_data: строка initData (из tg.initData)
    :param bot_token: токен бота
    :param max_age_seconds: максимальный возраст auth_date (по умолчанию 24 часа).
                            None — не проверять.
    :return: dict с данными пользователя (с ключом "id") или None при ошибке.
    """
    if not init_data or not bot_token:
        return None

    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=False)
    except Exception:
        return None

    received_hash = None
    data_pairs: list[tuple[str, str]] = []
    for k, v in pairs:
        if k == "hash":
            received_hash = v
        else:
            data_pairs.append((k, v))

    if not received_hash:
        return None

    data_check_string = _build_data_check_string(data_pairs)

    secret_key = hmac.new(
        b"WebAppData",
        bot_token.encode("utf-8"),
        hashlib.sha256,
    ).digest()

    computed_hash = hmac.new(
        secret_key,
        data_check_string.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        return None

    # Проверка свежести
    if max_age_seconds is not None:
        try:
            auth_date = int(dict(data_pairs).get("auth_date", "0"))
        except (TypeError, ValueError):
            return None
        if auth_date <= 0 or (time.time() - auth_date) > max_age_seconds:
            return None

    raw_user = dict(data_pairs).get("user")
    if not raw_user:
        return None
    try:
        user = json.loads(raw_user)
    except json.JSONDecodeError:
        return None
    if not isinstance(user, dict) or "id" not in user:
        return None
    return user


def extract_user(init_data: str, bot_token: str, *, max_age_seconds: Optional[int] = 86400):
    """
    Алиас для verify_init_data — оставлено для удобства чтения кода в api.py.
    """
    return verify_init_data(init_data, bot_token, max_age_seconds=max_age_seconds)