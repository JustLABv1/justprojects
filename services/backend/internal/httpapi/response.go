package httpapi

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

type apiError struct {
	Error string `json:"error"`
}

func writeError(c *gin.Context, status int, err error) {
	c.AbortWithStatusJSON(status, apiError{Error: err.Error()})
}

func badRequest(c *gin.Context, err error) {
	writeError(c, http.StatusBadRequest, err)
}

func unauthorized(c *gin.Context) {
	writeError(c, http.StatusUnauthorized, errors.New("authentication required"))
}

func forbidden(c *gin.Context) {
	writeError(c, http.StatusForbidden, errors.New("insufficient permissions"))
}

func notFound(c *gin.Context) {
	writeError(c, http.StatusNotFound, errors.New("resource not found"))
}

func conflict(c *gin.Context, message string) {
	writeError(c, http.StatusConflict, errors.New(message))
}
