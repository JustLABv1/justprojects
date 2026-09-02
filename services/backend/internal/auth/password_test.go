package auth

import "testing"

func TestPasswordHashAndVerify(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}
	if !VerifyPassword("correct horse battery staple", hash) {
		t.Fatal("VerifyPassword() rejected the original password")
	}
	if VerifyPassword("wrong password", hash) {
		t.Fatal("VerifyPassword() accepted a different password")
	}
}

func TestVerifyPasswordRejectsMalformedHash(t *testing.T) {
	for _, value := range []string{"", "argon2id$v=19$m=bad,t=3,p=2$salt$key", "argon2id$v=19$m=65536,t=3,p=2$not-base64$key"} {
		if VerifyPassword("anything", value) {
			t.Fatalf("VerifyPassword() accepted malformed hash %q", value)
		}
	}
}
