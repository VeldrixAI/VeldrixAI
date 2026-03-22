"""
Test PostgreSQL connection and data persistence
"""
import sys
from sqlalchemy import create_engine, text
from app.core.config import settings

def test_connection():
    """Test database connection"""
    print("=" * 60)
    print("Testing PostgreSQL Connection")
    print("=" * 60)
    
    try:
        engine = create_engine(settings.DATABASE_URL)
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version();"))
            version = result.fetchone()[0]
            print(f"[OK] Connected to PostgreSQL!")
            print(f"Version: {version}\n")
            return True
    except Exception as e:
        print(f"[ERROR] Connection failed: {e}\n")
        return False

def test_tables():
    """Check if users table exists"""
    print("Checking database tables...")
    
    try:
        engine = create_engine(settings.DATABASE_URL)
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public'
            """))
            tables = [row[0] for row in result]
            
            if 'users' in tables:
                print(f"[OK] 'users' table exists")
                
                # Count users
                count_result = conn.execute(text("SELECT COUNT(*) FROM users"))
                count = count_result.fetchone()[0]
                print(f"[OK] Total users in database: {count}\n")
                
                # Show users
                if count > 0:
                    users_result = conn.execute(text("""
                        SELECT id, email, role, is_active, created_at 
                        FROM users 
                        ORDER BY created_at DESC
                    """))
                    print("Users in database:")
                    print("-" * 60)
                    for user in users_result:
                        print(f"ID: {user[0]}")
                        print(f"Email: {user[1]}")
                        print(f"Role: {user[2]}")
                        print(f"Active: {user[3]}")
                        print(f"Created: {user[4]}")
                        print("-" * 60)
                
                return True
            else:
                print(f"[ERROR] 'users' table not found")
                print(f"Available tables: {tables}")
                print("\nRun the server once to create tables automatically.")
                return False
                
    except Exception as e:
        print(f"[ERROR] Error checking tables: {e}\n")
        return False

def main():
    print("\nPostgreSQL Connection & Persistence Test\n")
    
    print(f"Database URL: {settings.DATABASE_URL.split('@')[1] if '@' in settings.DATABASE_URL else settings.DATABASE_URL}\n")
    
    # Test 1: Connection
    if not test_connection():
        print("Fix the connection issue before proceeding.")
        sys.exit(1)
    
    # Test 2: Tables
    test_tables()
    
    print("\n" + "=" * 60)
    print("Next Steps:")
    print("=" * 60)
    print("1. Start the server: py -m uvicorn app.main:app --reload")
    print("2. Register a user via API or test script")
    print("3. Run this script again to see persisted data")
    print("=" * 60)

if __name__ == "__main__":
    main()
