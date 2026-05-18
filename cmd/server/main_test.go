package main

import "testing"

func TestAllowInsecureDevSecret(t *testing.T) {
	t.Setenv("ALLOW_INSECURE_DEFAULT_SECRET", "true")
	t.Setenv("APP_ENV", "production")
	if !allowInsecureDevSecret() {
		t.Fatal("explicit override should allow insecure secret")
	}

	t.Setenv("ALLOW_INSECURE_DEFAULT_SECRET", "false")
	t.Setenv("APP_ENV", "development")
	if !allowInsecureDevSecret() {
		t.Fatal("development env should allow insecure secret")
	}

	t.Setenv("APP_ENV", "production")
	if allowInsecureDevSecret() {
		t.Fatal("production env without override should disallow insecure secret")
	}
}
