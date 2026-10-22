# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`
- Read an issue: `gh issue view <number> --json number,title,body,labels,comments`
- List issues: `gh issue list --state open --json number,title,body,labels,comments`
- Comment on an issue: `gh issue comment <number> --body "..."`
- Apply or remove labels with `gh issue edit`
- Close an issue with `gh issue close`

Infer the repository from the Git remote; `gh` does this automatically inside the clone.

## Pull requests as a triage surface

PRs as a request surface: no.

## Blocking

Use GitHub native issue dependencies where available. Otherwise record `Blocked by: #<number>` in the issue body.
