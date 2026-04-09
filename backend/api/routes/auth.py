# Auth-Routen: serverseitiger Signup, der mit Service-Role-Key arbeitet
# und User+Company+Profile atomar erstellt. Vermeidet die RLS-Race-Condition
# die im Client-seitigen Signup-Flow auftritt.

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from auth import supabase_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _cleanup_orphan(client, user_id: str, company_id: str | None = None) -> None:
    if company_id:
        try:
            client.table("companies").delete().eq("id", company_id).execute()
        except Exception as cleanup_err:
            logger.error(
                "Failed to cleanup orphan company %s for user %s: %s",
                company_id, user_id, cleanup_err,
            )
    try:
        client.auth.admin.delete_user(user_id)
    except Exception as cleanup_err:
        logger.error("Failed to cleanup orphan user %s: %s", user_id, cleanup_err)


class SignupBody(BaseModel):
    email: str
    password: str
    company_name: str
    display_name: str


class SignupResponse(BaseModel):
    user_id: str
    company_id: str


@router.post("/signup", response_model=SignupResponse)
def signup(body: SignupBody) -> SignupResponse:
    if "@" not in body.email or "." not in body.email:
        raise HTTPException(status_code=400, detail="Invalid email address.")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if not body.company_name.strip():
        raise HTTPException(status_code=400, detail="Company name is required.")
    if not body.display_name.strip():
        raise HTTPException(status_code=400, detail="Display name is required.")

    client = supabase_service()

    try:
        created = client.auth.admin.create_user({
            "email": body.email,
            "password": body.password,
            "email_confirm": True,
        })
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Signup failed: {err}")

    user = created.user if created else None
    if user is None or not user.id:
        raise HTTPException(status_code=500, detail="Signup failed: no user returned.")

    user_id = user.id

    try:
        company_res = (
            client.table("companies")
            .insert({"name": body.company_name.strip()})
            .execute()
        )
    except Exception as err:
        _cleanup_orphan(client, user_id)
        raise HTTPException(status_code=500, detail=f"Failed to create company: {err}")

    if not company_res.data:
        _cleanup_orphan(client, user_id)
        raise HTTPException(status_code=500, detail="Failed to create company: no row returned.")

    company_id = company_res.data[0]["id"]

    try:
        client.table("profiles").insert({
            "id": user_id,
            "company_id": company_id,
            "display_name": body.display_name.strip(),
        }).execute()
    except Exception as err:
        _cleanup_orphan(client, user_id, company_id)
        raise HTTPException(status_code=500, detail=f"Failed to create profile: {err}")

    return SignupResponse(user_id=user_id, company_id=company_id)
