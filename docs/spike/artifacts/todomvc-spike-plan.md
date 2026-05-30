# TodoMVC Comprehensive Test Plan

## Application Overview

TodoMVC (React implementation) at https://demo.playwright.dev/todomvc/ is a single-page todo list application. The UI consists of: a text input for adding todos, a list of todo items each with a toggle checkbox and a hover-visible delete button, a toggle-all checkbox, a footer with an item counter, three filter links (All / Active / Completed), and a "Clear completed" button that appears only when at least one item is completed. Items are edited via double-click on the label, which replaces the label with an inline text field. The app uses hash-based routing (#/, #/active, #/completed). There is no persistence across hard page reloads (state is in-memory React). All interactions explored confirmed correct reactive behavior: counter updates, filter visibility, toggle states, and edit lifecycle all work as specified by the TodoMVC spec.

## Test Scenarios

### 1. Adding Todo Items

**Seed:** ``

#### 1.1. Add a single todo item

**File:** `tests/todomvc/add-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/
    - expect: The page loads with the heading 'todos' and the placeholder input 'What needs to be done?' visible
    - expect: No todo list, counter, or filter links are present
  2. Click the 'What needs to be done?' input field and type 'Buy groceries'
    - expect: The text 'Buy groceries' appears in the input field
  3. Press Enter
    - expect: The input field is cleared
    - expect: A new list item 'Buy groceries' appears in the todo list
    - expect: The footer shows '1 item left'
    - expect: The filter links All / Active / Completed are now visible

#### 1.2. Add multiple todo items in sequence

**File:** `tests/todomvc/add-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/
    - expect: The page loads in empty state
  2. Type 'First task' and press Enter
    - expect: 'First task' appears as item 1 in the list
    - expect: Counter shows '1 item left'
  3. Type 'Second task' and press Enter
    - expect: 'Second task' appears as item 2 in the list
    - expect: Counter shows '2 items left'
  4. Type 'Third task' and press Enter
    - expect: 'Third task' appears as item 3 in the list
    - expect: Counter shows '3 items left'
    - expect: Items appear in the order they were added

#### 1.3. Empty input is not added as a todo

**File:** `tests/todomvc/add-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/
    - expect: The page loads in empty state
  2. Click the input field and press Enter without typing anything
    - expect: No todo item is added
    - expect: The list remains absent from the page
    - expect: No footer or counter appears

#### 1.4. Whitespace-only input is not added as a todo

**File:** `tests/todomvc/add-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/
    - expect: The page loads in empty state
  2. Click the input field, type three space characters, and press Enter
    - expect: No todo item is added
    - expect: The list and footer remain absent from the page

### 2. Marking Todos Complete and Incomplete

**Seed:** ``

#### 2.1. Mark a single todo as complete

**File:** `tests/todomvc/complete-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add two items: 'Task A' and 'Task B'
    - expect: Both items appear in the list
    - expect: Counter shows '2 items left'
  2. Click the toggle checkbox to the left of 'Task A'
    - expect: 'Task A' is visually marked as completed (strikethrough style)
    - expect: The toggle checkbox for 'Task A' appears checked
    - expect: Counter updates to '1 item left'
    - expect: The 'Clear completed' button appears in the footer

#### 2.2. Unmark a completed todo back to active

**File:** `tests/todomvc/complete-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Task A', then click its toggle checkbox to mark it complete
    - expect: 'Task A' appears completed
    - expect: Counter shows '0 items left'
  2. Click the toggle checkbox of 'Task A' again to uncheck it
    - expect: 'Task A' is no longer styled as completed
    - expect: Counter updates to '1 item left'
    - expect: The 'Clear completed' button disappears

#### 2.3. Toggle all todos complete using the toggle-all checkbox

**File:** `tests/todomvc/complete-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add three items: 'Task A', 'Task B', 'Task C'
    - expect: All three items appear active
    - expect: Counter shows '3 items left'
  2. Click the toggle-all chevron/checkbox (❯ Mark all as complete) above the list
    - expect: All three items are marked as completed
    - expect: The toggle-all checkbox itself appears checked
    - expect: Counter updates to '0 items left'
    - expect: The 'Clear completed' button appears
  3. Click the toggle-all checkbox again
    - expect: All three items are unchecked and active again
    - expect: Counter updates to '3 items left'
    - expect: The 'Clear completed' button disappears

### 3. Filtering Todos

**Seed:** ``

#### 3.1. Active filter shows only incomplete items

**File:** `tests/todomvc/filter-todos.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add three items: 'Task A', 'Task B', 'Task C'. Mark 'Task A' as complete.
    - expect: All three items are visible in the All view
    - expect: Counter shows '2 items left'
  2. Click the 'Active' filter link
    - expect: The URL changes to #/active
    - expect: The 'Active' link is visually highlighted as selected
    - expect: Only 'Task B' and 'Task C' are visible in the list
    - expect: 'Task A' is not shown

#### 3.2. Completed filter shows only completed items

**File:** `tests/todomvc/filter-todos.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add three items: 'Task A', 'Task B', 'Task C'. Mark 'Task A' as complete.
    - expect: All three items visible in All view
  2. Click the 'Completed' filter link
    - expect: The URL changes to #/completed
    - expect: The 'Completed' link is visually highlighted as selected
    - expect: Only 'Task A' is visible in the list
    - expect: 'Task B' and 'Task C' are not shown

#### 3.3. All filter shows every item regardless of status

**File:** `tests/todomvc/filter-todos.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/, add 'Task A', 'Task B', 'Task C', mark 'Task A' complete, then click the 'Active' filter
    - expect: Only active items are shown
  2. Click the 'All' filter link
    - expect: The URL changes to #/
    - expect: The 'All' link is visually highlighted
    - expect: All three items ('Task A', 'Task B', 'Task C') are visible
    - expect: 'Task A' still appears completed

#### 3.4. Active filter shows empty list when all items are completed

**File:** `tests/todomvc/filter-todos.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/, add 'Task A', and mark it as complete
    - expect: Counter shows '0 items left'
  2. Click the 'Active' filter link
    - expect: The URL changes to #/active
    - expect: The todo list shows no items
    - expect: The footer counter still shows '0 items left'

#### 3.5. Completed filter shows empty list when no items are completed

**File:** `tests/todomvc/filter-todos.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Task A' without marking it complete
    - expect: Counter shows '1 item left'
    - expect: No 'Clear completed' button present
  2. Click the 'Completed' filter link
    - expect: The URL changes to #/completed
    - expect: The todo list shows no items
    - expect: The counter still shows '1 item left'

### 4. Clearing Completed Todos

**Seed:** ``

#### 4.1. Clear completed removes all completed items

**File:** `tests/todomvc/clear-completed.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Task A', 'Task B', 'Task C'. Mark 'Task A' and 'Task B' as complete.
    - expect: Counter shows '1 item left'
    - expect: 'Clear completed' button is visible
  2. Click the 'Clear completed' button
    - expect: 'Task A' and 'Task B' are removed from the list
    - expect: 'Task C' remains visible
    - expect: Counter shows '1 item left'
    - expect: The 'Clear completed' button disappears

#### 4.2. Clear completed with all items marked removes entire list

**File:** `tests/todomvc/clear-completed.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Task A', 'Task B'. Click the toggle-all checkbox to mark all complete.
    - expect: Both items appear completed
    - expect: Counter shows '0 items left'
    - expect: 'Clear completed' button is visible
  2. Click the 'Clear completed' button
    - expect: The todo list, footer toolbar (counter, filters, clear button) all disappear
    - expect: The app returns to the empty state with only the input field visible

#### 4.3. Clear completed button is absent when no items are completed

**File:** `tests/todomvc/clear-completed.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Task A' without marking it complete
    - expect: The footer shows the counter and filter links
    - expect: The 'Clear completed' button is not present in the footer

### 5. Editing Todo Items

**Seed:** ``

#### 5.1. Edit a todo item text via double-click and confirm with Enter

**File:** `tests/todomvc/edit-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Original text'
    - expect: 'Original text' appears in the list
  2. Double-click on the 'Original text' label
    - expect: The item enters edit mode: the label is replaced by an inline text input pre-filled with 'Original text'
    - expect: The edit input is focused
  3. Clear the edit input and type 'Updated text', then press Enter
    - expect: The edit mode closes
    - expect: The item now shows 'Updated text'
    - expect: The list count remains '1 item left'

#### 5.2. Cancel editing a todo with Escape restores original text

**File:** `tests/todomvc/edit-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Original text'
    - expect: 'Original text' appears in the list
  2. Double-click the label to enter edit mode
    - expect: Edit input appears with 'Original text'
  3. Append ' extra' to the text in the edit field so it reads 'Original text extra', then press Escape
    - expect: The edit mode closes without saving
    - expect: The item still shows 'Original text'
    - expect: No change has been applied

#### 5.3. Editing a todo to empty text deletes the item

**File:** `tests/todomvc/edit-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Task to remove'
    - expect: Item appears in the list
    - expect: Counter shows '1 item left'
  2. Double-click the label to enter edit mode
    - expect: Edit input appears pre-filled with 'Task to remove'
  3. Clear the entire edit input field and press Enter
    - expect: The item is deleted from the list
    - expect: The list and footer disappear
    - expect: The app returns to empty state

#### 5.4. Edit mode is only active on one item at a time

**File:** `tests/todomvc/edit-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Task A' and 'Task B'
    - expect: Both items appear in the list
  2. Double-click the label of 'Task A' to enter edit mode
    - expect: 'Task A' shows the edit input
    - expect: 'Task B' remains displayed as a normal list item with its checkbox and label
  3. Press Enter to confirm the edit on 'Task A' without changing the text
    - expect: 'Task A' exits edit mode and shows its label
    - expect: Both items are still present in the list

### 6. Deleting Todo Items

**Seed:** ``

#### 6.1. Delete a single todo via the hover delete button

**File:** `tests/todomvc/delete-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Task A' and 'Task B'
    - expect: Both items appear in the list
    - expect: Counter shows '2 items left'
  2. Hover over 'Task A' to reveal the delete button (×)
    - expect: A delete button (×) becomes visible on the right side of 'Task A'
  3. Click the delete button (×) on 'Task A'
    - expect: 'Task A' is removed from the list
    - expect: 'Task B' remains
    - expect: Counter updates to '1 item left'

#### 6.2. Deleting the last item returns app to empty state

**File:** `tests/todomvc/delete-todo.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add one item 'Only task'
    - expect: The item appears
    - expect: Counter shows '1 item left'
  2. Hover over 'Only task' to reveal the delete button, then click it
    - expect: 'Only task' is removed
    - expect: The todo list section disappears
    - expect: The footer with counter and filters disappears
    - expect: The app shows only the input field in empty state

### 7. Item Counter Accuracy

**Seed:** ``

#### 7.1. Counter reflects only active (non-completed) items

**File:** `tests/todomvc/counter.spec.ts`

**Steps:**
  1. Navigate to https://demo.playwright.dev/todomvc/ and add 'Task A', 'Task B', 'Task C'
    - expect: Counter shows '3 items left'
  2. Mark 'Task A' as complete
    - expect: Counter shows '2 items left'
  3. Mark 'Task B' as complete
    - expect: Counter shows '1 item left' (singular form)
  4. Mark 'Task C' as complete
    - expect: Counter shows '0 items left'
