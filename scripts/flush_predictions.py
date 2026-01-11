
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv('DATABASE_URL')

def flush_db():
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        
        print("🧹 Flushing stale predictions from database...")
        cur.execute("DELETE FROM predicted_hotspots;")
        rows_deleted = cur.rowcount
        
        conn.commit()
        cur.close()
        conn.close()
        
        print(f"✅ Successfully removed {rows_deleted} stale prediction records.")
        print("   The system is now forced to regenerate authentic forecasts for all dates.")
        
    except Exception as e:
        print(f"❌ Error flushing database: {e}")

if __name__ == "__main__":
    flush_db()
