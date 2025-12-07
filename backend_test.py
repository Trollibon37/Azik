import requests
import sys
import json
from datetime import datetime

class YigitGameAPITester:
    def __init__(self, base_url="https://punchgame-yigit.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
        
        result = {
            "test_name": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status = "✅ PASSED" if success else "❌ FAILED"
        print(f"{status} - {name}")
        if details:
            print(f"   Details: {details}")

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    response_data = response.json()
                    details += f", Response: {json.dumps(response_data, indent=2)[:200]}..."
                    self.log_test(name, True, details)
                    return True, response_data
                except:
                    self.log_test(name, True, details)
                    return True, {}
            else:
                try:
                    error_data = response.json()
                    details += f", Error: {error_data}"
                except:
                    details += f", Error: {response.text[:100]}"
                self.log_test(name, False, details)
                return False, {}

        except Exception as e:
            self.log_test(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root API Endpoint", "GET", "", 200)

    def test_user_registration(self):
        """Test user registration"""
        timestamp = datetime.now().strftime('%H%M%S')
        test_user_data = {
            "username": f"testuser_{timestamp}",
            "email": f"test_{timestamp}@example.com",
            "password": "TestPass123!"
        }
        
        success, response = self.run_test(
            "User Registration", 
            "POST", 
            "auth/register", 
            200, 
            test_user_data
        )
        
        if success and 'token' in response:
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            return True
        return False

    def test_user_login(self):
        """Test user login with existing credentials"""
        # First register a user
        timestamp = datetime.now().strftime('%H%M%S')
        register_data = {
            "username": f"logintest_{timestamp}",
            "email": f"logintest_{timestamp}@example.com",
            "password": "LoginTest123!"
        }
        
        # Register user
        reg_success, reg_response = self.run_test(
            "Pre-Login Registration", 
            "POST", 
            "auth/register", 
            200, 
            register_data
        )
        
        if not reg_success:
            return False
        
        # Now test login
        login_data = {
            "email": register_data["email"],
            "password": register_data["password"]
        }
        
        success, response = self.run_test(
            "User Login", 
            "POST", 
            "auth/login", 
            200, 
            login_data
        )
        
        if success and 'token' in response:
            # Update token for subsequent tests
            self.token = response['token']
            self.user_id = response.get('user', {}).get('id')
            return True
        return False

    def test_get_current_user(self):
        """Test getting current user info"""
        if not self.token:
            self.log_test("Get Current User", False, "No token available")
            return False
        
        return self.run_test("Get Current User", "GET", "user/me", 200)[0]

    def test_save_game(self):
        """Test saving a game"""
        if not self.token:
            self.log_test("Save Game", False, "No token available")
            return False
        
        game_data = {
            "mode": "Tek Kişilik - Kolay",
            "score": 25,
            "duration": 15
        }
        
        return self.run_test("Save Game", "POST", "game/save", 200, game_data)[0]

    def test_get_game_records(self):
        """Test getting game records"""
        if not self.token:
            self.log_test("Get Game Records", False, "No token available")
            return False
        
        return self.run_test("Get Game Records", "GET", "game/records", 200)[0]

    def test_get_leaderboard(self):
        """Test getting leaderboard (public endpoint)"""
        return self.run_test("Get Leaderboard", "GET", "leaderboard", 200)[0]

    def test_get_achievements(self):
        """Test getting user achievements"""
        if not self.token:
            self.log_test("Get Achievements", False, "No token available")
            return False
        
        return self.run_test("Get User Achievements", "GET", "achievements", 200)[0]

    def test_invalid_login(self):
        """Test login with invalid credentials"""
        invalid_data = {
            "email": "nonexistent@example.com",
            "password": "wrongpassword"
        }
        
        return self.run_test("Invalid Login", "POST", "auth/login", 401, invalid_data)[0]

    def test_duplicate_registration(self):
        """Test registering with existing email"""
        # First register a user
        timestamp = datetime.now().strftime('%H%M%S%f')  # More unique timestamp
        first_user = {
            "username": f"firstuser_{timestamp}",
            "email": f"duplicate_test_{timestamp}@example.com",
            "password": "TestPass123!"
        }
        
        # Register first user
        first_success, _ = self.run_test(
            "First User Registration", 
            "POST", 
            "auth/register", 
            200, 
            first_user
        )
        
        if not first_success:
            return False
        
        # Try to register with same email but different username
        duplicate_data = {
            "username": f"seconduser_{timestamp}",
            "email": first_user["email"],  # Same email
            "password": "DifferentPass123!"
        }
        
        return self.run_test("Duplicate Email Registration", "POST", "auth/register", 400, duplicate_data)[0]

    def test_unauthorized_access(self):
        """Test accessing protected endpoint without token"""
        # Temporarily remove token
        original_token = self.token
        self.token = None
        
        success = self.run_test("Unauthorized Access", "GET", "user/me", 401)[0]
        
        # Restore token
        self.token = original_token
        return success

    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Yiğit Game API Tests...")
        print(f"Testing against: {self.base_url}")
        print("=" * 50)

        # Test sequence
        tests = [
            self.test_root_endpoint,
            self.test_user_registration,
            self.test_user_login,
            self.test_get_current_user,
            self.test_save_game,
            self.test_get_game_records,
            self.test_get_leaderboard,
            self.test_get_achievements,
            self.test_invalid_login,
            self.test_duplicate_registration,
            self.test_unauthorized_access
        ]

        for test in tests:
            try:
                test()
            except Exception as e:
                self.log_test(test.__name__, False, f"Test exception: {str(e)}")
            print()

        # Print summary
        print("=" * 50)
        print(f"📊 Test Summary:")
        print(f"   Total Tests: {self.tests_run}")
        print(f"   Passed: {self.tests_passed}")
        print(f"   Failed: {self.tests_run - self.tests_passed}")
        print(f"   Success Rate: {(self.tests_passed/self.tests_run)*100:.1f}%")
        
        return self.tests_passed == self.tests_run

def main():
    tester = YigitGameAPITester()
    success = tester.run_all_tests()
    
    # Save detailed results
    with open('/app/test_reports/backend_api_results.json', 'w', encoding='utf-8') as f:
        json.dump({
            'summary': {
                'total_tests': tester.tests_run,
                'passed_tests': tester.tests_passed,
                'failed_tests': tester.tests_run - tester.tests_passed,
                'success_rate': (tester.tests_passed/tester.tests_run)*100 if tester.tests_run > 0 else 0
            },
            'detailed_results': tester.test_results
        }, f, indent=2, ensure_ascii=False)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())