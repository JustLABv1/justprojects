package httpapi

import (
	"encoding/json"
	"testing"
)

func TestNullableStringInputDistinguishesOmittedAndExplicitNull(t *testing.T) {
	tests := []struct {
		name    string
		payload string
		set     bool
		value   *string
	}{
		{name: "omitted", payload: `{}`, set: false},
		{name: "null", payload: `{"assigneeId":null}`, set: true},
		{name: "value", payload: `{"assigneeId":"user-1"}`, set: true, value: testStringPtr("user-1")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var input struct {
				AssigneeID nullableStringInput `json:"assigneeId"`
			}
			if err := json.Unmarshal([]byte(test.payload), &input); err != nil {
				t.Fatalf("json.Unmarshal() error = %v", err)
			}
			if input.AssigneeID.Set != test.set {
				t.Fatalf("Set = %t, want %t", input.AssigneeID.Set, test.set)
			}
			if (input.AssigneeID.Value == nil) != (test.value == nil) {
				t.Fatalf("Value = %v, want %v", input.AssigneeID.Value, test.value)
			}
			if input.AssigneeID.Value != nil && *input.AssigneeID.Value != *test.value {
				t.Fatalf("Value = %q, want %q", *input.AssigneeID.Value, *test.value)
			}
		})
	}
}

func testStringPtr(value string) *string {
	return &value
}
