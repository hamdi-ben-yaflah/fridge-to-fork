"""Drop the template's Item table

Revision ID: 3b7e1c0f2a91
Revises: fe56fa70289e
Create Date: 2026-11-24 10:00:00.000000

"""
import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision = "3b7e1c0f2a91"
down_revision = "fe56fa70289e"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_table("item")


def downgrade():
    op.create_table(
        "item",
        sa.Column("title", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=False),
        sa.Column("description", sqlmodel.sql.sqltypes.AutoString(length=255), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
