# Obsidian Rule Engine <img src="https://img.shields.io/github/manifest-json/v/jackcarey/obsidian-rule-engine"> <img src="https://img.shields.io/github/downloads/jackcarey/obsidian-rule-engine/total">

A plugin for [Obsidian](https://obsidian.md/) that lets you define rules to automate commands and render HTML views for your notes. Transform how your notes behave and are displayed by defining custom rules that match specific files.

_Expands on [anuwup/obsidian-custom-views](https://github.com/anuwup/obsidian-custom-views) (MIT license)._

**Features**

- render HTML templates on individual markdown files.
- render HTML templates on canvas nodes.
- render HTML templates on each `.base` item.
- automatically run list of commands against individual files.
- automatically run lists of commands against each `.base` item.

![edit rule modal](screenshots/editRuleModal.png)

**Permissions & behavior**

- **Vault enumeration**: the plugin lists vault files (`vault.getFiles()`/`getMarkdownFiles()`) so it can match them against your configured rules — this is core to how rule matching works.
- **Dynamic code execution**: `<script>` tags inside templates are opt-in and run via `new Function()` (see [Script Support](#script-support)). Scripts with a `src` attribute are always ignored, so templates can't load remote code.
- **Bundled ML model, no network access**: the `Generate semantic tags` command embeds a small ([MiniLM](https://huggingface.co/Xenova/all-MiniLM-L6-v2)) model directly in the plugin. It never downloads anything or contacts the network — see [Tag generation commands](#tag-generation-commands).

## Commands

Any command available in the current Obsidian context will be available to include in rules. When rules execute, only commands available in that context will run.
Rules are checked on individual files when they open. They are checked on `.base` results when they change. You can also use the 'process now' command to run rules on demand.

Commands from all matching rules wll execute in order.

![commands section](screenshots/commands.png)

### Provided commands

By default, commands provided by this plugin are disabled. You can enable them in the plugin settings.

- `Force template` - Apply a template to the current file regardless of rule automations and conditions.
- `Restore view` - Remove any applied templates from the current file.
- `Process now` - Check and execute automations as if the file has just been opened.
- `Generate TF-IDF tags` - Score the current file's words against other notes and append the most distinctive terms to a frontmatter field. See [Tag generation commands](#tag-generation-commands).
- `Generate semantic tags` - Match the current file's content against tags already used in your vault, using a small bundled embedding model, and append the closest matches to a frontmatter field. See [Tag generation commands](#tag-generation-commands).

### Third party commands

Any command available in the current Obsidian context will be available to include in rules. When rules execute, only commands available in that context will run. This means you can use commands from Obsidian itself or any other plugin. Avoid automating commands that require input when they run as these parameters cannot be selected.

### Tag generation commands

Both commands write to the same kind of frontmatter list field (`tags` by default) and share the same append/limit logic:

- They **append**, never overwrite — your existing tags are always kept in full; the commands only ever add to them, never remove or replace them.
- A **max tags** setting is a ceiling on the field's total tag count, not a target to hit. It only limits how many *new* tags get added — e.g. with max tags set to 10, a file with 6 existing tags gets up to 4 new ones added, while a file that already has 11 gets 0 added (and still keeps all 11 — the limit never trims what's already there).
- Values are normalized before being written (no `#` prefix, spaces become dashes, `/` hierarchy separators are preserved).

**`Generate TF-IDF tags`** scores the words in the current file against a corpus of other notes (TF-IDF: term frequency × inverse document frequency) and appends the highest-scoring terms.

- **Frontmatter field** - which list field to write to (default `tags`).
- **Max tags** - the ceiling described above.
- **Compare against** - `Whole vault` (most accurate, scans every note) or `Linked notes` (faster on large vaults — only the current file's forward links and backlinks).

**`Generate semantic tags`** uses a small (~23 MB) bundled embedding model ([Xenova/all-MiniLM-L6-v2](https://huggingface.co/Xenova/all-MiniLM-L6-v2), quantized) to find new tags for the current file, up to the max tags ceiling. The model runs entirely locally — nothing is downloaded or sent anywhere, and it works offline.

- **Frontmatter field** and **Max tags** - same as above.
- **Existing vault tags vs invented tags** - a 0-100% slider. Whenever there's room to add tags, this controls where they come from: at 100%, every new tag is one already used elsewhere in your vault (keeps your tagging vocabulary consistent, never invents new words — this is closer to how `Generate TF-IDF tags` sources its candidates, though scored differently); at 0%, new tags are instead invented from the current file's own distinctive content (the same TF-IDF scoring `Generate TF-IDF tags` uses), even if nothing like them exists elsewhere in the vault yet. Values in between blend the two.
- The first run after starting Obsidian takes a moment while the model loads; subsequent runs are fast.

## Base files

When opening or updating a Base that uses the 'Rule Engine' view, rules with the 'base' or 'both' file handling will execute commands and apply templates.

### Table layout

Execute commands against results.
![rule engine table base view](screenshots/table_view.png)

## Card layout

Using the card layout you can apply matching templates to each item automatically. Since base and rule filters can differ, you can apply different templates to each card.

![rule engine custom card template](screenshots/card_template.png)

### Settings

Configure the layout mode, toggle command execution and templates.

![rule engine settings](screenshots/card_settings.png)

## Custom Views

Use the `HTML template` field in rules to render notes using custom HTML templates. If the `template` field is blank, no template will be used. The first matching template from the list of rules will be used.

![output](https://github.com/user-attachments/assets/f94e92b6-93a0-42eb-a9c7-bad6bc3aa7e2)

<!-- *[GIF: Show a note with frontmatter (e.g., a movie note with title, year, rating) being displayed in a custom card view instead of the default markdown view. Show the transition from default view to custom view.]* -->

**Custom views** allow you to:

- Create beautiful, custom HTML templates for specific notes
- Match files using powerful filter rules (file properties, frontmatter, tags, etc.)
- Transform data using filter chains (date formatting, text transformations, etc.)
- Render note content as markdown within your custom templates
- Render templates within base cards, to give you a customized overview.

Perfect for creating card views, dashboards, or any custom presentation of your notes!

### Usage

#### Getting Started

<!-- 1. **Enable the plugin** in **Settings → Community plugins**.
2. Go to **Settings → Rule Engine** to configure your automations.
3. Click **"Add Rule"** to create your first rule.
4. Define **filter rules** to match which files should use this view.
5. Write an **HTML template** to customize how those files are displayed. -->

#### Basic Example

Let's create a simple view for movie notes. First, add a filter rule:

- **Property**: `file.folder`
- **Operator**: `contains`
- **Value**: `Movies`

Then, create a template like this:

```html
<div class="movie-card">
	<h1>{{title}}</h1>
	<p>Year: {{year}}</p>
	<p>Rating: {{rating}}/10</p>
	<div>{{file.content}}</div>
</div>
```

Now, any note in a folder containing "Movies" will be displayed using this custom template instead of the default markdown view!

### Features

#### Filter Rules

Match files using powerful filter rules based on file properties or frontmatter. You can combine multiple conditions using AND, OR, or NOR logic.

**Available Properties:**

- **File properties**: `file.name`, `file.path`, `file.folder`, `file.size`, `file.ctime`, `file.mtime`, `file.extension`
- **Frontmatter**: Any property from your note's frontmatter (e.g., `title`, `tags`, `status`, `date`)
- **Tags**: The `tags` property (automatically detected as a list)

**Operators:**

- **Text**: `contains`, `does not contain`, `is`, `is not`, `starts with`, `ends with`, `is empty`, `is not empty`
- **Numbers**: `=`, `≠`, `<`, `≤`, `>`, `≥`, `is empty`, `is not empty`
- **Dates**: `on`, `not on`, `before`, `on or before`, `after`, `on or after`, `within past N <unit>`, `within future N <unit>`, `is empty`, `is not empty`
  - Relative date units: `minutes`, `hours`, `days`, `weeks`, `months` (e.g. `within past 7 days`, `within future 2 weeks`)
  - Works on `file.ctime`, `file.mtime`, and frontmatter date string fields
- **Lists/Tags**: `contains`, `does not contain`, `is empty`, `is not empty`
- **Checkboxes**: `is` (true/false)

#### HTML Templates

Write custom HTML templates using a simple placeholder syntax. Access file properties using `{{file.property}}` and frontmatter properties using `{{property}}`.

**Basic Placeholders:**

- `{{file.name}}` - The full filename (e.g., "My Note.md")
- `{{file.basename}}` - The filename without extension (e.g., "My Note")
- `{{file.path}}` - The full file path
- `{{file.folder}}` - The folder path
- `{{file.size}}` - File size in bytes
- `{{file.ctime}}` - Creation timestamp
- `{{file.mtime}}` - Modification timestamp
- `{{file.content}}` - The note body rendered as markdown
- `{{file.tags}}` - File tags (from both body and frontmatter)
- `{{property}}` - Any frontmatter property (e.g., `{{title}}`, `{{cover}}`, `{{rating}}`)

**Array Access:**

- `{{file.tags[0]}}` - First tag
- `{{file.tags[1]}}` - Second tag
- etc.

#### Filter Chains

Transform values using filter chains. Chain multiple filters together using the pipe (`|`) operator.

**Example:**

```html
<h1>{{title | capitalize}}</h1>
<p>Published: {{date | date:"MMMM DD, YYYY"}}</p>
<p>Tags: {{file.tags | join:", " | wikilink}}</p>
```

**Available Filters:**

##### Date Filters

- `date:"FORMAT"` - Format a date (e.g., `date:"YYYY-MM-DD"`, `date:"MMMM DD, YYYY"`)
- `date:"FORMAT":"INPUT_FORMAT"` - Parse and format a date with custom input format
- `date_modify:"+1 year"` - Modify a date (e.g., `"+1 year"`, `"-2 months"`)

##### Text Transformation

- `capitalize` - Capitalize first letter
- `upper` - Convert to uppercase
- `lower` - Convert to lowercase
- `title` - Title case
- `camel` - Convert to camelCase
- `kebab` - Convert to kebab-case
- `snake` - Convert to snake_case
- `trim` - Remove leading/trailing whitespace
- `replace:"search":"replace"` - Replace text (supports regex: `replace:"/pattern/flags":"replace"`)

##### Markdown Formatting

- `wikilink:"alias"` - Convert to wikilink `[[value|alias]]`
- `link:"text"` - Convert to markdown link `[text](value)`
- `image:"alt"` - Convert to markdown image `![alt](value)`
- `blockquote` - Convert each line to blockquote

##### Array Operations

- `split:","` - Split string into array
- `join:", "` - Join array into string
- `first` - Get first element
- `last` - Get last element
- `slice:0:5` - Slice array or string
- `count` - Get length of array or string

##### HTML Processing

- `strip_tags` - Remove HTML tags

##### Math

- `calc:"+10"` - Perform calculation (`+`, `-`, `*`, `/`, `^`)

#### View Modes

The plugin works in different view modes based on your settings:

- **Reading Mode**: Custom views always work in reading mode (preview mode).
- **Live Preview**: Optionally enable custom views in live preview mode via **Settings → Custom Views → Work in Live Preview**.
- **Source Mode**: Custom views are disabled in pure source mode (true editor mode).

#### Multiple Views

You can create multiple custom views. The plugin will use the first matching view for each file. This allows you to have different templates for different types of notes.

**Example:**

- View 1: Movie cards (matches `file.folder contains "Movies"`)
- View 2: Book cards (matches `file.folder contains "Books"`)
- View 3: Project dashboards (matches `file.status is "active"`)

#### Script Support

You can include `<script>` tags in your templates for dynamic behavior. Scripts are executed when the template is rendered, allowing you to add interactivity to your custom views.

```html
<div class="interactive-card">
	<h2>{{title}}</h2>
	<button onclick="toggleDetails()">Show Details</button>
	<div id="details" style="display: none;">{{file.content}}</div>
</div>

<script>
	function toggleDetails() {
		const details = document.getElementById("details");
		details.style.display =
			details.style.display === "none" ? "block" : "none";
	}
</script>
```

> [!WARNING]
> Scripts in templates are executed when the view is rendered. Be careful with scripts from untrusted sources.

### Examples

#### Movie Card View

**Filter Rule:**

- `file.folder` contains `Movies`

**Template:**

```html
<div
	class="movie-card"
	style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid var(--background-modifier-border); border-radius: 8px;"
>
	<h1 style="margin-top: 0;">{{title}}</h1>
	<div style="display: flex; gap: 20px; margin-bottom: 20px;">
		<div><strong>Year:</strong> {{year}}</div>
		<div><strong>Rating:</strong> {{rating}}/10</div>
		<div><strong>Genre:</strong> {{genre | join:", "}}</div>
	</div>
	<div style="margin-top: 20px;">{{file.content}}</div>
</div>
```

#### Project Dashboard

**Filter Rule:**

- `file.status` is `active`

**Template:**

```html
<div class="project-dashboard">
	<h1>{{file.name | replace:".md":"" | title}}</h1>
	<div class="metadata">
		<p><strong>Status:</strong> {{status | capitalize}}</p>
		<p><strong>Due Date:</strong> {{due_date | date:"MMMM DD, YYYY"}}</p>
		<p><strong>Progress:</strong> {{progress}}%</p>
	</div>
	<div class="tags">Tags: {{file.tags | join:", " | wikilink}}</div>
	<hr />
	<div class="content">{{file.content}}</div>
</div>
```

#### Book Review Card

**Filter Rule:**

- `file.tags` contains `book`

**Template:**

```html
<div
	style="display: grid; grid-template-columns: 200px 1fr; gap: 20px; padding: 20px;"
>
	<div>
		<img
			src="{{cover_image}}"
			alt="{{title}}"
			style="width: 100%; border-radius: 4px;"
		/>
	</div>
	<div>
		<h1>{{title}}</h1>
		<p><strong>Author:</strong> {{author}}</p>
		<p><strong>Published:</strong> {{published | date:"YYYY"}}</p>
		<p><strong>Rating:</strong> {{rating}}/5 ⭐</p>
		<div style="margin-top: 20px;">{{file.content}}</div>
	</div>
</div>
```

### Settings

Access settings via **Settings → Rule Engine**.

![settings menu](screenshots/settings.png)

#### Global Settings

- **Template in Live Preview** - If enabled, custom views work in both reading mode and live preview mode. If disabled, custom views only work in reading mode.
- **Template in canvas (experimental)** - Apply templates to Markdown file nodes in canvas files.
- **Process .base files automatically** - Allow rules to execute across the 'rule engine' view in `.base` files automatically when data changes.

#### Rule Configuration

Each rule has:

- **Name** - A descriptive name for the view
- **Filter Conditions** - Conditions that determine which files match this view
- **Base file handling** - Whether the rule runs against individual files, base file results, or both.
- **Commands** - An ordered list of commands to run when a file matches the filter conditions
- **HTML template** - The HTML template to render for matching files
- **Enable for file** - Apply the template when the file is rendered as a normal Markdown note
- **Enable for base views** - Also apply the template when the file is rendered inside a `.base` query
- **Enable for canvas** - Also apply the template when the file is rendered as a Canvas node

#### Per-file Command Overrides

You can override command settings for individual files using frontmatter keys in the format `ore:[command-id]:[setting]`.

- `ore:[command-id]:enabled: false` — disable a specific command for this file
- `ore:[command-id]:params: {key: value}` — pass custom parameters to a command for this file

**Example:**

```yaml
---
ore:apply-task-due-date:enabled: false
---
```

This disables the `apply-task-due-date` command for this specific file, regardless of the rule's command list.

### Template Reference

#### Placeholder Syntax

For file properties:

```
{{file.PROPERTY[INDEX] | FILTER1:ARG1,ARG2 | FILTER2:ARG3}}
```

For frontmatter properties:

```
{{PROPERTY[INDEX] | FILTER1:ARG1,ARG2 | FILTER2:ARG3}}
```

- `PROPERTY` - The property name (file property with `file.` prefix, or frontmatter key without prefix)
- `[INDEX]` - Optional array index (e.g., `[0]` for first element)
- `| FILTER:ARGS` - Optional filter chain

#### Special Placeholders

- `{{file.content}}` - Renders the note body as markdown. This is always rendered as markdown, regardless of context.

#### Context-Aware Rendering

Placeholders are rendered differently based on context:

- **Inside HTML attributes** (e.g., `href="{{file.path}}"` or `src="{{cover}}"`): Returns raw string value
- **In HTML body**: Renders as markdown if the value contains markdown syntax (like `[[links]]`)

#### Filter Chain Syntax

Filters are chained using the pipe (`|`) operator:

```
{{date | date:"YYYY-MM-DD" | upper}}
```

Filter arguments can be:

- **Simple values**: `date:"YYYY-MM-DD"`
- **Multiple arguments**: `replace:"old":"new"` (comma-separated, or use quotes for strings with commas)
- **Regex patterns**: `replace:"/pattern/flags":"replace"`

### Updating the bundled semantic model

The `Generate semantic tags` command's model isn't fetched at runtime — it's embedded directly into `main.js` at build time, so the plugin has no network dependency. If you're changing which model is used or refreshing its weights:

1. Edit the constants at the top of `fetch-model-assets.mjs` (`MODEL_ID`, `HF_FILES`) to point at a different Hugging Face repo. It needs to publish a quantized ONNX `feature-extraction` export compatible with [`@huggingface/transformers`](https://www.npmjs.com/package/@huggingface/transformers) — check the model card's `onnx/` folder. Keep an eye on the total size: the model + tokenizer files plus the ~13 MB onnxruntime-web WASM runtime all end up base64-encoded inside `main.js`.
2. Delete `src/assets/model/` (gitignored, so it won't show up as a diff) and run `npm run fetch-model-assets` to pull the new files down.
3. Run `npm run build` — `esbuild.config.mjs`'s `.onnx`/`.wasm`/`.txt` loaders pick the new files up automatically via `src/semanticModel/modelAssets.ts`, no other code changes needed.
4. Run the E2E suite (`npm run test:e2e`) — `tests/e2e/tagging.spec.ts` runs real inference inside a real Obsidian window, which is the only way to actually confirm a new model loads and runs correctly (unit tests mock the model out entirely).

All of the model-loading logic (and the workaround for Electron's renderer confusing the library's environment detection — see the comment at the top of `loadExtractor` in `src/semanticModel/semanticModel.ts`) is isolated in `src/semanticModel/semanticModel.ts`. If you ever want to switch away from bundling (e.g. back to fetching from Hugging Face or your own release assets at first use instead of embedding), that's the only file that needs to change — everything else calls its `embedTexts()` export and doesn't know or care how the model was loaded.

### Contributing

Any contributions and PRs are welcome! Feel free to open an issue or submit a pull request.
