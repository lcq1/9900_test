"""Portable study designs: deliberately exclude credentials, responses and files."""
from copy import deepcopy
from typing import Literal
from pydantic import ConfigDict, Field, ValidationError
from app.core.models import gen_uuid
from app.core.schemas import CamelModel
from app.researcher.schemas import Stage, StageComponent


class TemplateComponent(StageComponent):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(max_length=20000)


class TemplateStage(Stage):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=255)
    components: list[TemplateComponent] = Field(default_factory=list, max_length=100)


class StudyTemplate(CamelModel):
    model_config = ConfigDict(extra="forbid")
    format: Literal["beyond-study-template"]
    version: Literal[1]
    name: str = Field(min_length=1, max_length=255)
    full_screen: bool = False
    storage_notice: str = Field(default="", max_length=8000)
    stages: list[TemplateStage] = Field(default_factory=list, max_length=20)


def _design_for(experiment) -> StudyTemplate:
    stages = []
    for raw in experiment.stages:
        stage = Stage.model_validate(raw)
        # Existing records may carry extension fields, including file references.
        clean = {key: deepcopy(getattr(stage, key)) for key in Stage.model_fields if key != "components"}
        clean["components"] = [{key: deepcopy(getattr(item, key)) for key in StageComponent.model_fields}
                               for item in stage.components]
        stages.append(TemplateStage.model_validate(clean))
    return StudyTemplate(format="beyond-study-template", version=1, name=experiment.name, full_screen=experiment.full_screen,
                         storage_notice=experiment.storage_notice, stages=stages)


def fresh_stages(template: StudyTemplate) -> list[dict]:
    stages = template.model_dump(by_alias=True)["stages"]
    for stage in stages:
        stage["id"] = gen_uuid()
        for component in stage["components"]:
            component["id"] = gen_uuid()
    return stages


def design_for(experiment) -> StudyTemplate:
    try:
        return _design_for(experiment)
    except ValidationError:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="This draft exceeds the portable template limits. Review stage names, question lengths and component counts before exporting or duplicating.")
