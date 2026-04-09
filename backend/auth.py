# Auth-Schicht: validiert Supabase JWT aus dem Authorization Header,
# holt die company_id aus dem profiles-Table und stellt beides als
# FastAPI-Dependency current_user fuer geschuetzte Routen bereit.

from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from supabase import Client, create_client

import config


@dataclass
class CurrentUser:
    user_id: str
    company_id: str


_anon_client: Client | None = None
_service_client: Client | None = None


def supabase_anon() -> Client:
    """Client mit Publishable Key — wird fuer auth.get_user(token) benutzt."""
    global _anon_client
    if _anon_client is None:
        if not config.SUPABASE_URL or not config.SUPABASE_PUBLISHABLE_KEY:
            raise RuntimeError("SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY not set.")
        _anon_client = create_client(config.SUPABASE_URL, config.SUPABASE_PUBLISHABLE_KEY)
    return _anon_client


def supabase_service() -> Client:
    """Client mit Secret Key — bypassed RLS, fuer Server-Operationen."""
    global _service_client
    if _service_client is None:
        if not config.SUPABASE_URL or not config.SUPABASE_SECRET_KEY:
            raise RuntimeError("SUPABASE_URL or SUPABASE_SECRET_KEY not set.")
        _service_client = create_client(config.SUPABASE_URL, config.SUPABASE_SECRET_KEY)
    return _service_client


def current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    """FastAPI Dependency: validiert JWT, holt user_id + company_id."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is missing or is not a bearer token.",
        )

    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Leeres Token.")

    try:
        user_response = supabase_anon().auth.get_user(token)
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Token validation failed: {err}",
        )

    user = user_response.user if user_response else None
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token invalid.")

    try:
        profile = (
            supabase_service()
            .table("profiles")
            .select("company_id")
            .eq("id", user.id)
            .maybe_single()
            .execute()
        )
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load profile for user {user.id}: {err}",
        )

    if not profile or not profile.data or not profile.data.get("company_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No profile with company_id found for this user.",
        )

    return CurrentUser(user_id=user.id, company_id=profile.data["company_id"])


CurrentUserDep = Depends(current_user)
