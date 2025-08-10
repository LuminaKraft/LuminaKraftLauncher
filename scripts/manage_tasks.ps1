# Manage GitHub tasks: create draft items in a GitHub Project (Todo list)
# Usage: .\manage_tasks.ps1 [-TasksFile "path\to\tasks.txt"] [-Org "OrgOrUser"] [-ProjectNumber "1"] [-ProjectId "PVT_..."] [-Assignee "githubUser"]
#
# tasks.txt format (both supported):
#
# 1) New format (recommended):
#    Title | P0|P1|P2 | Optional description
#
# 2) Legacy format:
#    High|Medium|Low | Title | Optional description
#
# Mapping: High->P0, Medium->P1, Low->P2

param (
    [string]$TasksFile = ".\scripts\tasks.txt",
    [string]$Org = "LuminaKraft",
    [string]$ProjectNumber = "1",
    [string]$ProjectId = "PVT_kwDODP6cIc4BAJn-",
    [string]$Assignee = "kristiangarcia"
)

function Get-ProjectId {
    if ($ProjectId -and $ProjectId.Trim().Length -gt 0) { return $ProjectId.Trim() }
    # Try without owner (some gh versions infer current context)
    $proj = gh project view $ProjectNumber --format json --jq .id 2>&1
    if ($LASTEXITCODE -eq 0 -and $proj) { return $proj.Trim() }

    # Try with explicit owner value
    $proj = gh project view $ProjectNumber --owner "$Org" --format json --jq .id 2>&1
    if ($LASTEXITCODE -eq 0 -and $proj) { return $proj.Trim() }

    # Try with current user
    $proj = gh project view $ProjectNumber --owner "@me" --format json --jq .id 2>&1
    if ($LASTEXITCODE -eq 0 -and $proj) { return $proj.Trim() }

    Write-Host "Failed to get project id for owner '$Org' and number '$ProjectNumber'"
    Write-Host $proj
    return $null
}

function Get-StatusFieldMeta {
    # Fallback to various owner contexts to avoid owner-type issues
    $fieldsJson = gh project field-list $ProjectNumber --format json 2>&1
    if ($LASTEXITCODE -ne 0 -or -not $fieldsJson) {
        $fieldsJson = gh project field-list $ProjectNumber --owner "$Org" --format json 2>&1
    }
    if ($LASTEXITCODE -ne 0 -or -not $fieldsJson) {
        $fieldsJson = gh project field-list $ProjectNumber --owner "@me" --format json 2>&1
    }
    if ($LASTEXITCODE -ne 0 -or -not $fieldsJson) {
        Write-Host "Failed to list project fields for $Org/$ProjectNumber"
        Write-Host $fieldsJson
        return $null
    }
    $fields = ($fieldsJson | ConvertFrom-Json).fields
    $statusField = $fields | Where-Object { $_.name -eq 'Status' }
    if (-not $statusField) { return $null }
    $todo = $statusField.options | Where-Object { $_.name -eq 'Todo' }
    if (-not $todo) { return $null }
    return @{ FieldId = $statusField.id; TodoId = $todo.id }
}

function Get-PriorityFieldMeta {
    $fieldsJson = gh project field-list $ProjectNumber --owner "$Org" --format json 2>&1
    if ($LASTEXITCODE -ne 0 -or -not $fieldsJson) {
        Write-Host "Failed to list project fields for $Org/$ProjectNumber"
        Write-Host $fieldsJson
        return $null
    }
    $fields = ($fieldsJson | ConvertFrom-Json).fields
    $priorityField = $fields | Where-Object { $_.name -eq 'Priority' }
    if (-not $priorityField -or -not $priorityField.options) { return $null }
    $map = @{}
    foreach ($opt in $priorityField.options) { $map[$opt.name] = $opt.id }
    return @{ FieldId = $priorityField.id; OptionsByName = $map }
}

function Create-DraftItem {
    param (
        [string]$title,
        [string]$body
    )
    $finalBody = if ($body) { "$body`nAssignee: @$Assignee" } else { "Assignee: @$Assignee" }
    $itemId = & gh project item-create $ProjectNumber --owner $Org --title $title --body $finalBody --format json --jq .id 2>&1
    if ($LASTEXITCODE -ne 0 -or -not $itemId) {
        Write-Host "Failed to create draft item: $title"
        Write-Host $itemId
        return $null
    }
    return $itemId.Trim()
}

function Set-ItemStatusTodo {
    param (
        [string]$itemId,
        [string]$projectId,
        [string]$statusFieldId,
        [string]$todoOptionId
    )
    gh project item-edit --id "$itemId" --project-id "$projectId" --field-id "$statusFieldId" --single-select-option-id "$todoOptionId" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        return $false
    }
    return $true
}

function Set-ItemPriority {
    param (
        [string]$itemId,
        [string]$projectId,
        [string]$priorityFieldId,
        [string]$priorityOptionId
    )
    gh project item-edit --id "$itemId" --project-id "$projectId" --field-id "$priorityFieldId" --single-select-option-id "$priorityOptionId" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { return $false }
    return $true
}

function Try-AssignItem {
    param (
        [string]$itemId,
        [string]$projectId,
        [string]$assignee
    )
    # Note: Assignees field is not supported for updates via API/CLI on Project drafts as of now.
    # This call will likely fail; we keep it to pick up support automatically if/when it becomes available.
    $assigneesField = (gh project field-list $ProjectNumber --owner "$Org" --format json | ConvertFrom-Json).fields | Where-Object { $_.name -eq 'Assignees' }
    if (-not $assigneesField) { return $false }
    gh project item-edit --id "$itemId" --project-id "$projectId" --field-id "$assigneesField.id" --text "$assignee" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { return $false }
    return $true
}

# Read tasks, skip comments and empty lines
$tasks = Get-Content $TasksFile | Where-Object { $_ -and -not $_.TrimStart().StartsWith('#') }

if (-not $tasks) {
    Write-Host "No tasks to add in $TasksFile"
    exit
}

$projectId = Get-ProjectId
if (-not $projectId) { exit 1 }
$statusMeta = Get-StatusFieldMeta
if (-not $statusMeta) {
    Write-Host "Could not resolve Status field metadata for project."
    exit 1
}
$priorityMeta = Get-PriorityFieldMeta
if (-not $priorityMeta) {
    Write-Host "Could not resolve Priority field metadata for project."
    exit 1
}

$addedTasks = @()
foreach ($task in $tasks) {
    $raw = $task.Trim()
    $parts = $raw -split '\|', 3

    $title = $null
    $desc = ''
    $priorityToken = $null

    if ($parts.Count -ge 2 -and ($parts[0].Trim() -in @('High','Medium','Low','P0','P1','P2'))) {
        $priorityToken = $parts[0].Trim()
        $title = $parts[1].Trim()
        if ($parts.Count -ge 3) { $desc = $parts[2].Trim() }
    } elseif ($parts.Count -ge 2 -and ($parts[1].Trim() -in @('P0','P1','P2'))) {
        $title = $parts[0].Trim()
        $priorityToken = $parts[1].Trim()
        if ($parts.Count -ge 3) { $desc = $parts[2].Trim() }
    } else {
        $title = $raw
        $priorityToken = 'P2'
    }

    switch ($priorityToken) {
        'High' { $priorityLabel = 'P0' }
        'Medium' { $priorityLabel = 'P1' }
        'Low' { $priorityLabel = 'P2' }
        default { $priorityLabel = $priorityToken }
    }

    $priorityOptionId = $null
    if ($priorityMeta.OptionsByName.ContainsKey($priorityLabel)) {
        $priorityOptionId = $priorityMeta.OptionsByName[$priorityLabel]
    } else {
        $priorityOptionId = $priorityMeta.OptionsByName['P2']
    }

    $body = if ($desc -ne '') { $desc } else { 'Imported task from tasks.txt' }

    Write-Host "Creating draft item for task: $title"
    $itemId = Create-DraftItem -title $title -body $body
    if ($itemId) {
        $okStatus = Set-ItemStatusTodo -itemId $itemId -projectId $projectId -statusFieldId $statusMeta.FieldId -todoOptionId $statusMeta.TodoId
        $okPriority = Set-ItemPriority -itemId $itemId -projectId $projectId -priorityFieldId $priorityMeta.FieldId -priorityOptionId $priorityOptionId
        $okAssign = Try-AssignItem -itemId $itemId -projectId $projectId -assignee $Assignee
        if (-not $okAssign) { Write-Host "Warning: could not set Assignees on draft item (not supported)" }
        if ($okStatus -and $okPriority) {
            Write-Host "Task added as draft in project: $title (Priority=$priorityLabel)"
            $addedTasks += $task
        } else {
            Write-Host "Failed to update fields for item: $itemId"
        }
    }
}

if ($addedTasks.Count -gt 0) {
    $answer = Read-Host 'Clean tasks file by removing added tasks? (Y/n)'
    if (($answer.Trim().ToLower() -eq '') -or ($answer.Trim().ToLower() -eq 'y')) {
        $allLines = Get-Content $TasksFile
        $filteredLines = $allLines | Where-Object { 
            ($_ -eq '') -or ($_.TrimStart().StartsWith('#')) -or (-not ($addedTasks -contains $_.Trim())) 
        }
        Set-Content -Path $TasksFile -Value $filteredLines
        Write-Host "Added tasks removed from '$TasksFile'."
    } else {
        Write-Host 'Tasks file left unchanged.'
    }
} else {
    Write-Host 'No tasks were added, file unchanged.'
}
