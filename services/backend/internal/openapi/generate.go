// Package openapi contains the code-generation hook for the checked-in API
// contract. Generated transport types can be refreshed with `make generate`.
package openapi

//go:generate sh -c "oapi-codegen -generate types,gin-server -package openapi ../../api/openapi.yaml > generated.go"
