#!/usr/bin/env bash

declare -Agr B=(
  [B]=$(echo -e "\e[44m")
  [C]=$(echo -e "\e[46m")
  [G]=$(echo -e "\e[42m")
  [K]=$(echo -e "\e[40m")
  [M]=$(echo -e "\e[45m")
  [R]=$(echo -e "\e[41m")
  [W]=$(echo -e "\e[47m")
  [Y]=$(echo -e "\e[43m")
)
declare -Agr F=(
  [B]=$(echo -e "\e[0;34m")
  [C]=$(echo -e "\e[0;36m")
  [G]=$(echo -e "\e[0;32m")
  [K]=$(echo -e "\e[0;30m")
  [M]=$(echo -e "\e[0;35m")
  [R]=$(echo -e "\e[0;31m")
  [W]=$(echo -e "\e[0;37m")
  [Y]=$(echo -e "\e[0;33m")
)
readonly NC=$(echo -e "\e[0m")

export B
export F
export NC

# Log Functions
LOG_TEMP=$(mktemp) || echo "Failed to create temporary log file."
export LOG_TEMP
echo "super-linter Log" > "${LOG_TEMP}"
log() {
  local TOTERM=${1:-}
  local MESSAGE=${2:-}
  echo -e "${MESSAGE:-}" | (
    if [[ -n ${TOTERM} ]]; then
      tee -a "${LOG_TEMP}" >&2
    else
      cat >> "${LOG_TEMP}" 2>&1
    fi
  )
}
trace() { log "${LOG_TRACE:-}" "${NC}$(date +"%F %T") ${F[B]}[TRACE ]${NC}   $*${NC}"; }
debug() { log "${LOG_DEBUG:-}" "${NC}$(date +"%F %T") ${F[B]}[DEBUG ]${NC}   $*${NC}"; }
info() { log "${LOG_VERBOSE:-}" "${NC}$(date +"%F %T") ${F[B]}[INFO  ]${NC}   $*${NC}"; }
notice() { log "true" "${NC}$(date +"%F %T") ${F[G]}[NOTICE]${NC}   $*${NC}"; }
warn() { log "true" "${NC}$(date +"%F %T") ${F[Y]}[WARN  ]${NC}   $*${NC}"; }
error() { log "true" "${NC}$(date +"%F %T") ${F[R]}[ERROR ]${NC}   $*${NC}"; }
fatal() {
  log "true" "${NC}$(date +"%F %T") ${B[R]}${F[W]}[FATAL ]${NC}   $*${NC}"
  exit 1
}
