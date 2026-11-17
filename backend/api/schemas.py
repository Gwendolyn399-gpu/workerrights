from typing import Any

from pydantic import BaseModel, Field


class CreateCaseRequest(BaseModel):
    scene: str = Field(default="construction_wage_arrears", max_length=64)


class SendMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class UpdateFactsRequest(BaseModel):
    facts: dict[str, Any]


class UpdateStepRequest(BaseModel):
    done: bool
