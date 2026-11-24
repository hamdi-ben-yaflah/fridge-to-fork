from fastapi import APIRouter

from app.api.routes import login, private, users, utils
from app.chef.api import routes as chef_routes
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(chef_routes.router)


if settings.FASTAPI_ENV == "development":
    api_router.include_router(private.router)
