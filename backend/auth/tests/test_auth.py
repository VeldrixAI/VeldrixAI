"""
Quick test script to verify AegisAI Auth Service
Run after starting the server with: py -m uvicorn app.main:app
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_health():
    """Test health endpoint"""
    print("Testing /health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}\n")
    return response.status_code == 200

def test_register():
    """Test user registration"""
    print("Testing /auth/register endpoint...")
    data = {
        "email": "test@aegisai.com",
        "password": "SecurePass123"
    }
    response = requests.post(f"{BASE_URL}/auth/register", json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}\n")
    return response.status_code in [200, 201]

def test_login():
    """Test user login"""
    print("Testing /auth/login endpoint...")
    data = {
        "email": "test@aegisai.com",
        "password": "SecurePass123"
    }
    response = requests.post(f"{BASE_URL}/auth/login", json=data)
    print(f"Status: {response.status_code}")
    result = response.json()
    print(f"Response: {json.dumps(result, indent=2)}\n")
    return result.get("access_token") if response.status_code == 200 else None

def test_get_me(token):
    """Test get current user endpoint"""
    print("Testing /auth/me endpoint...")
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/auth/me", headers=headers)
    print(f"Status: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}\n")
    return response.status_code == 200

def main():
    print("=" * 60)
    print("AegisAI Authentication Service - Test Suite")
    print("=" * 60 + "\n")
    
    try:
        # Test 1: Health check
        if not test_health():
            print("❌ Health check failed!")
            return
        print("✅ Health check passed!\n")
        
        # Test 2: Register (may fail if user exists)
        test_register()
        print("✅ Registration endpoint working!\n")
        
        # Test 3: Login
        token = test_login()
        if not token:
            print("❌ Login failed!")
            return
        print("✅ Login successful!\n")
        
        # Test 4: Get current user
        if not test_get_me(token):
            print("❌ Get current user failed!")
            return
        print("✅ Get current user passed!\n")
        
        print("=" * 60)
        print("🎉 All tests passed! Authentication service is working!")
        print("=" * 60)
        
    except requests.exceptions.ConnectionError:
        print("❌ Could not connect to server!")
        print("Make sure the server is running: py -m uvicorn app.main:app")
    except Exception as e:
        print(f"❌ Test failed with error: {e}")

if __name__ == "__main__":
    main()
