from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.core.middleware.auth import get_current_user
from src.db.base import get_db
from src.modules.support.schemas.support_schema import SubmitTicketRequest, TicketResponse
from src.modules.support.services.support_service import SupportService

router = APIRouter(prefix="/api/support", tags=["support"])


@router.post("/tickets", response_model=TicketResponse, status_code=201)
async def submit_ticket(
    body: SubmitTicketRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["id"])
    ticket  = SupportService(db).submit_ticket(request=body, user_id=user_id)
    return TicketResponse(
        id=str(ticket.id),
        ticket_id=ticket.ticket_id,
        user_email=ticket.user_email,
        subject=ticket.subject,
        category=ticket.category,
        priority=ticket.priority,
        description=ticket.description,
        status=ticket.status,
        created_at=ticket.created_at,
    )


@router.get("/tickets", response_model=list[TicketResponse])
async def list_tickets(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["id"])
    tickets = SupportService(db).get_tickets_by_user(user_id)
    return [
        TicketResponse(
            id=str(t.id),
            ticket_id=t.ticket_id,
            user_email=t.user_email,
            subject=t.subject,
            category=t.category,
            priority=t.priority,
            description=t.description,
            status=t.status,
            created_at=t.created_at,
        )
        for t in tickets
    ]
