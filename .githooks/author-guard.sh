#!/bin/sh
# Author guard: stops commits and pushes made under a different Git identity
# than the one this clone last used, unless the switch is confirmed.
#
# The remembered identity lives in this clone's config:
#   git config neil.author "Name <email>"
# Confirm a switch interactively (type "yes"), or, without a terminal, with
#   NEIL_AUTHOR_CONFIRM=<new email> git commit ...
# A confirmed commit makes the new identity the remembered one.

remembered=$(git config --get neil.author)

say() { printf '%s\n' "$*" >&2; }

# confirm <question> <email that NEIL_AUTHOR_CONFIRM must equal>
confirm() {
	if [ -n "$NEIL_AUTHOR_CONFIRM" ]; then
		[ "$NEIL_AUTHOR_CONFIRM" = "$2" ] && return 0
		say "author-guard: NEIL_AUTHOR_CONFIRM does not match $2."
		return 1
	fi
	if (exec </dev/tty) 2>/dev/null; then
		printf '%s Type "yes" to continue: ' "$1" >/dev/tty
		read -r answer </dev/tty
		[ "$answer" = "yes" ] && return 0
		say "author-guard: aborted."
		return 1
	fi
	say "author-guard: no terminal to confirm in. Re-run with NEIL_AUTHOR_CONFIRM=$2 to confirm."
	return 1
}

email_of() { printf '%s\n' "$1" | sed -n 's/.*<\(.*\)>.*/\1/p'; }

guard_commit() {
	# git var resolves GIT_AUTHOR_* env (also set by --author) before user.* config.
	current=$(git var GIT_AUTHOR_IDENT | sed 's/ [0-9]* [-+][0-9]*$//')
	[ "$current" = "$remembered" ] && return 0
	say ""
	if [ -z "$remembered" ]; then
		say "author-guard: no author remembered for this clone yet."
	else
		say "author-guard: author changed."
		say "  before: $remembered"
	fi
	say "  now:    $current"
	confirm "Commit as $current?" "$(email_of "$current")" || return 1
	git config neil.author "$current"
	say "author-guard: remembered $current."
}

guard_push() {
	remote="$1"
	[ -z "$remembered" ] && { say "author-guard: no author remembered; set it with: git config neil.author \"Name <email>\""; return 1; }
	zero=0000000000000000000000000000000000000000
	strangers=""
	while read -r local_ref local_sha remote_ref remote_sha; do
		[ "$local_sha" = "$zero" ] && continue # branch deletion
		found=$(git log --format='%h %an <%ae>' "$local_sha" --not --remotes="$remote" |
			while read -r hash ident; do
				[ "$ident" = "$remembered" ] || printf '  %s %s\n' "$hash" "$ident"
			done)
		strangers="$strangers$found"
	done
	[ -z "$strangers" ] && return 0
	say ""
	say "author-guard: pushing commits not authored by $remembered:"
	say "$strangers"
	confirm "Push them anyway?" "$(email_of "$(printf '%s\n' "$strangers" | sed -n 's/^  [0-9a-f]* //p' | head -n 1)")"
}

case "$1" in
	commit) guard_commit ;;
	push) shift; guard_push "$@" ;;
esac
