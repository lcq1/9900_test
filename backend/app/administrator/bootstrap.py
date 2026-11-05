"""Grant the first administrator role to an existing active account."""
import argparse

from sqlalchemy import text

from app.core.database import SessionLocal
from app.researcher.models import Researcher
from app.researcher.repository import get_researcher_by_email, promote_researcher


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email", help="Email of the existing researcher account")
    args = parser.parse_args()
    with SessionLocal() as db:
        db.execute(text("SELECT pg_advisory_xact_lock(83155104)"))
        account = get_researcher_by_email(db, args.email)
        if account is None or account.account_status != "active" or not account.password_hash:
            parser.exit(1, "An active researcher account with a password is required.\n")
        if account.role == "administrator":
            print("The account is already an administrator.")
            return
        if db.query(Researcher).filter_by(role="administrator").first():
            parser.exit(1, "An administrator already exists. Use the administration dashboard.\n")
        promote_researcher(db, account.id)
        print("Administrator role granted. Sign in again to use it.")


if __name__ == "__main__":
    main()
