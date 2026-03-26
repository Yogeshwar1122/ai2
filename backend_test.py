import requests
import sys
import time
from datetime import datetime

class LockBoxAPITester:
    def __init__(self, base_url="https://lockbox-login.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.partial_token = None
        self.test_user_email = "test@lockbox.com"
        self.test_user_password = "SecurePass123"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_result(self, test_name, success, message="", response_data=None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {test_name}: PASSED - {message}")
        else:
            print(f"❌ {test_name}: FAILED - {message}")
        
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message,
            "response_data": response_data
        })

    def run_api_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        elif self.partial_token:
            test_headers['Authorization'] = f'Bearer {self.partial_token}'
            
        if headers:
            test_headers.update(headers)

        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        print(f"   Method: {method}")
        
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
            response_data = None
            
            try:
                response_data = response.json()
            except:
                response_data = {"raw_response": response.text}

            if success:
                self.log_result(name, True, f"Status: {response.status_code}", response_data)
            else:
                self.log_result(name, False, f"Expected {expected_status}, got {response.status_code}. Response: {response.text[:200]}", response_data)

            return success, response_data

        except Exception as e:
            self.log_result(name, False, f"Exception: {str(e)}")
            return False, {}

    def test_user_registration(self):
        """Test user registration"""
        # Create a unique test user
        timestamp = int(time.time())
        test_email = f"testuser{timestamp}@lockbox.com"
        
        success, response = self.run_api_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            {
                "email": test_email,
                "password": "TestPassword123!",
                "display_name": "Test User"
            }
        )
        return success, test_email

    def test_user_login(self):
        """Test user login with existing test user"""
        success, response = self.run_api_test(
            "User Login",
            "POST", 
            "auth/login",
            200,
            {
                "email": self.test_user_email,
                "password": self.test_user_password,
                "device_fingerprint": "test_device_fp_123",
                "user_agent": "Test Browser"
            }
        )
        
        if success and response:
            if response.get("mfa_required"):
                self.partial_token = response.get("partial_token")
                print(f"   MFA Required. Steps: {response.get('mfa_steps', [])}")
                return True, response
            else:
                self.token = response.get("token")
                print(f"   Direct login successful")
                return True, response
        
        return False, response

    def get_otp_from_logs(self, email):
        """Extract OTP from server logs"""
        import subprocess
        try:
            # Get the latest OTP for this email from server logs
            result = subprocess.run(
                ["grep", f"OTP for {email}", "/var/log/supervisor/backend.err.log"],
                capture_output=True, text=True
            )
            if result.returncode == 0 and result.stdout:
                lines = result.stdout.strip().split('\n')
                if lines:
                    # Get the last line and extract OTP
                    last_line = lines[-1]
                    # Extract 6-digit OTP from line like "OTP for email: 123456"
                    import re
                    match = re.search(r'OTP for [^:]+:\s*(\d{6})', last_line)
                    if match:
                        otp = match.group(1)
                        print(f"   📧 Found OTP in logs: {otp}")
                        return otp
            
            print(f"   ⚠️  No OTP found in logs for {email}")
            return None
        except Exception as e:
            print(f"   ❌ Error reading logs: {e}")
            return None

    def test_otp_verification(self, email=None):
        """Test OTP verification"""
        if not self.partial_token:
            self.log_result("OTP Verification", False, "No partial token available")
            return False
            
        test_email = email or self.test_user_email
        otp_code = self.get_otp_from_logs(test_email)
        
        if not otp_code:
            self.log_result("OTP Verification", False, "Could not extract OTP from server logs")
            return False
        
        success, response = self.run_api_test(
            "OTP Verification",
            "POST",
            "auth/verify-otp", 
            200,
            {
                "email": test_email,
                "otp_code": otp_code,
                "device_fingerprint": "test_device_fp_123"
            }
        )
        
        if success and response:
            if response.get("status") == "authenticated":
                self.token = response.get("token")
                print(f"   Authentication complete")
            elif response.get("status") == "mfa_continue":
                self.partial_token = response.get("partial_token")
                print(f"   MFA continues. Remaining steps: {response.get('remaining_steps', [])}")
        
        return success

    def test_authenticated_endpoints(self):
        """Test all authenticated endpoints"""
        if not self.token:
            print("\n⚠️  No authentication token available. Skipping authenticated tests.")
            return
            
        print(f"\n🔐 Testing authenticated endpoints with token...")
        
        # Test /auth/me
        self.run_api_test("Get User Profile", "GET", "auth/me", 200)
        
        # Test security endpoints
        self.run_api_test("Get Security Logs", "GET", "security/logs", 200)
        self.run_api_test("Get Analytics", "GET", "security/analytics", 200) 
        self.run_api_test("Get Threats", "GET", "security/threats", 200)
        self.run_api_test("Get Sessions", "GET", "security/sessions", 200)
        
        # Test settings endpoints
        self.run_api_test("Get Lock Config", "GET", "settings/lock-config", 200)
        
        # Test devices endpoint
        self.run_api_test("Get Devices", "GET", "devices", 200)

    def test_health_check(self):
        """Test API health check"""
        self.run_api_test("API Health Check", "GET", "", 200)

    def run_all_tests(self):
        """Run complete test suite"""
        print("🚀 Starting LockBox API Test Suite")
        print(f"   Backend URL: {self.base_url}")
        print(f"   Test User: {self.test_user_email}")
        print("=" * 60)
        
        # Test 1: Health check
        self.test_health_check()
        
        # Test 2: User registration (create new user)
        reg_success, new_email = self.test_user_registration()
        
        # Test 3: User login (with existing test user)
        login_success, login_response = self.test_user_login()
        
        # Test 4: OTP verification (if MFA required)
        if login_success and login_response and login_response.get("mfa_required"):
            print(f"\n📱 MFA Flow Required")
            print(f"   Steps: {login_response.get('mfa_steps', [])}")
            
            if "otp" in login_response.get("mfa_steps", []):
                otp_success = self.test_otp_verification()
                if not otp_success:
                    print(f"   ⚠️  OTP verification failed, but continuing with other tests")
        
        # Test 5: Authenticated endpoints (if we have token)
        self.test_authenticated_endpoints()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary:")
        print(f"   Total Tests: {self.tests_run}")
        print(f"   Passed: {self.tests_passed}")
        print(f"   Failed: {self.tests_run - self.tests_passed}")
        print(f"   Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        # Show failed tests
        failed_tests = [r for r in self.test_results if not r["success"]]
        if failed_tests:
            print(f"\n❌ Failed Tests:")
            for test in failed_tests:
                print(f"   - {test['test']}: {test['message']}")
        
        return self.tests_passed == self.tests_run

def main():
    tester = LockBoxAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())