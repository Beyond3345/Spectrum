-- Spectrum's numbered cross-references for Markdown (MIT, part of Spectrum; written for it, not taken from a filter).
--
-- Labels: a figure ![Caption](file.png){#fig:x}, a table whose caption ends {#tbl:x} (or #tab:x), a display equation
-- $$ … $$ {#eq:x} and a heading # Title {#sec:x}; Quarto's fig-x, tbl-x, eq-x and sec-x as well.
-- References: @fig:x or [@fig:x] give "Figure 1", [@fig:x; @fig:y] "Figures 1 and 2", [see @fig:x, left] keeps its
-- words, and [-@fig:x] gives the number alone. The filter runs before --citeproc, which then never sees them.
-- LaTeX and Typst number the labels themselves (\ref, ref()); any other output (Word) gets the numbers as text.
-- A reference to a heading in a document without numbered sections gives the heading's title, as a link.

local WORDS = { fig = 'Figure', tbl = 'Table', tab = 'Table', eq = 'Equation', sec = 'Section' }
local NBSP = '\u{00A0}'

-- the kind of a label or reference id ('fig', 'tbl', 'eq', 'sec'), or nil for a citation key
local function kind_of(id)
  local prefix = id:match('^(%a+)[:%-]')
  return prefix and WORDS[prefix] and prefix
end

local function warn(message)
  io.stderr:write('[WARNING] ' .. message .. '\n')
end

local labels = {} -- id → { word, number, title }
local counts = {}
local numbered_sections = false

-- only a label with a kind's prefix: a heading's own id (#introduction) stays out of the way of citation keys
local function add_label(id, word, number, title)
  if not kind_of(id) then return end
  if labels[id] then warn('The label ' .. id .. ' is used twice; references go to the first.') return end
  labels[id] = { word = word, number = number, title = title }
end

local function next_number(word)
  counts[word] = (counts[word] or 0) + 1
  return tostring(counts[word])
end

local function truthy(value)
  if value == nil then return false end
  local text = pandoc.utils.stringify(value)
  return value == true or text == 'true' or text == 'yes'
end

-- a trailing {#id} Str (with the space before it) taken off a list of inlines: the id, or nil
local function take_label(inlines)
  local last = inlines[#inlines]
  if not last or last.t ~= 'Str' then return nil end
  local id = last.text:match('^{#([^%s}]+)}$')
  if not id then return nil end
  inlines:remove(#inlines)
  while #inlines > 0 and (inlines[#inlines].t == 'Space' or inlines[#inlines].t == 'SoftBreak') do inlines:remove(#inlines) end
  return id
end

-- the inlines of an element's caption (a copy), and a function that puts them back
local function caption_of(el)
  local caption = el.caption
  local first = caption and caption.long and caption.long[1]
  if not first or not first.content then return nil end
  local inlines = first.content
  return inlines, function()
    first.content = inlines
    caption.long[1] = first
    el.caption = caption
  end
end

-- Word and the other outputs that number nothing: "Figure 1: " before the caption
local function number_caption(inlines, word, number)
  inlines:insert(1, pandoc.Str(word .. NBSP .. number .. ':'))
  inlines:insert(2, pandoc.Space())
end

local function is_latex() return FORMAT:match('latex') or FORMAT == 'beamer' end
local function is_typst() return FORMAT:match('typst') end
local function numbers_itself() return is_latex() or is_typst() end

-- $$ … $$ {#eq:x}: the equation numbered, its label taken off
local function equations(inlines)
  local out = pandoc.List()
  local i = 1
  while i <= #inlines do
    local el = inlines[i]
    local j = i + 1
    if inlines[j] and (inlines[j].t == 'Space' or inlines[j].t == 'SoftBreak') then j = j + 1 end
    local label = el.t == 'Math' and el.mathtype == 'DisplayMath' and inlines[j] and inlines[j].t == 'Str' and inlines[j].text:match('^{#([^%s}]+)}$')
    if label then
      local number = next_number('Equation')
      add_label(label, 'Equation', number)
      if is_latex() then
        out:insert(pandoc.RawInline('latex', '\\begin{equation}' .. el.text .. '\\label{' .. label .. '}\\end{equation}'))
      elseif is_typst() then
        local maths = pandoc.write(pandoc.Pandoc({ pandoc.Plain({ el }) }), 'typst'):gsub('%s+$', '')
        out:insert(pandoc.RawInline('typst', '#[#set math.equation(numbering: "(1)"); ' .. maths .. ' <' .. label .. '>]'))
      else
        out:insert(el)
        out:insert(pandoc.Space())
        out:insert(pandoc.Str('(' .. number .. ')'))
      end
      i = j + 1
    else
      out:insert(el)
      i = i + 1
    end
  end
  return out
end

local section_counts = {}

local function blocks(doc)
  return doc:walk({
    Figure = function(fig)
      local inlines, put = caption_of(fig)
      if not inlines or #inlines == 0 then return nil end
      local number = next_number('Figure')
      if fig.identifier ~= '' then add_label(fig.identifier, 'Figure', number) end
      if numbers_itself() then return nil end
      number_caption(inlines, 'Figure', number)
      put()
      return fig
    end,
    Table = function(tbl)
      local inlines, put = caption_of(tbl)
      if not inlines or #inlines == 0 then return nil end
      -- pandoc 3.8.2 and later read Table: … {#tbl:x} as the table's label; earlier ones leave it in the caption
      local id = take_label(inlines)
      if id and tbl.identifier == '' then tbl.identifier = id end
      local number = next_number('Table')
      if tbl.identifier ~= '' then add_label(tbl.identifier, 'Table', number) end
      if not numbers_itself() then number_caption(inlines, 'Table', number) end
      put()
      return tbl
    end,
    Header = function(h)
      if h.classes:includes('unnumbered') or h.classes:includes('-') then
        if h.identifier ~= '' then add_label(h.identifier, 'Section', nil, h.content) end
        return nil
      end
      section_counts[h.level] = (section_counts[h.level] or 0) + 1
      for level = h.level + 1, 10 do section_counts[level] = nil end
      local parts = {}
      for level = 1, h.level do parts[#parts + 1] = tostring(section_counts[level] or 0) end
      local number = numbered_sections and table.concat(parts, '.') or nil
      if h.identifier ~= '' then add_label(h.identifier, 'Section', number, h.content) end
      if number and not numbers_itself() then
        h.content:insert(1, pandoc.Str(number))
        h.content:insert(2, pandoc.Space())
        return h
      end
    end
  })
end

-- the number of a reference as the output writes it: \ref for LaTeX, ref() for Typst, else text
local function number_of(id, label)
  if is_latex() then
    return pandoc.RawInline('latex', label.word == 'Equation' and '\\eqref{' .. id .. '}' or '\\ref{' .. id .. '}')
  elseif is_typst() then
    local ref = '#ref(<' .. id .. '>, supplement: none);'
    return pandoc.RawInline('typst', label.word == 'Equation' and '(' .. ref .. ')' or ref)
  end
  return pandoc.Str(label.word == 'Equation' and '(' .. label.number .. ')' or label.number)
end

local function joined(items)
  local out = pandoc.List()
  for i, item in ipairs(items) do
    if i > 1 then
      if i == #items then out:extend({ pandoc.Space(), pandoc.Str('and'), pandoc.Space() }) else out:extend({ pandoc.Str(','), pandoc.Space() }) end
    end
    out:extend(item)
  end
  return out
end

-- one Cite's references, in words: "Figure 1", "Figures 1 and 2", "1" for [-@fig:x], a section's title unnumbered
local function reference(citations)
  local same = true
  for _, c in ipairs(citations) do
    if labels[c.id].word ~= labels[citations[1].id].word then same = false end
  end
  local items = {}
  for _, c in ipairs(citations) do
    local label = labels[c.id]
    local item = pandoc.List()
    if label.word == 'Section' and not label.number then
      item:insert(pandoc.Link(label.title, '#' .. c.id))
    else
      local word = (same and #citations > 1) and '' or label.word
      if c.mode ~= 'SuppressAuthor' and word ~= '' then item:insert(pandoc.Str(word .. NBSP)) end
      item:insert(number_of(c.id, label))
    end
    items[#items + 1] = item
  end
  local out = pandoc.List()
  local first = citations[1]
  if #first.prefix > 0 then out:extend(first.prefix) out:insert(pandoc.Space()) end
  if same and #citations > 1 and first.mode ~= 'SuppressAuthor' and labels[first.id].number then
    out:insert(pandoc.Str(labels[first.id].word .. 's' .. NBSP))
  end
  out:extend(joined(items))
  local suffix = citations[#citations].suffix
  if #suffix > 0 then out:extend(suffix) end
  return out
end

local function cite(el)
  local refs, others = {}, {}
  for _, c in ipairs(el.citations) do
    if kind_of(c.id) and labels[c.id] then
      refs[#refs + 1] = c
    elseif kind_of(c.id) then
      warn('Nothing is labelled ' .. c.id .. ' for the reference @' .. c.id .. '.')
      refs[#refs + 1] = false
    else
      others[#others + 1] = c
    end
  end
  if #refs == 0 then return nil end
  local found = {}
  local missing = false
  for _, c in ipairs(refs) do
    if c then found[#found + 1] = c else missing = true end
  end
  local out = pandoc.List()
  if #found > 0 then out:extend(reference(found)) end
  if missing then
    if #out > 0 then out:insert(pandoc.Space()) end
    out:insert(pandoc.Strong({ pandoc.Str('??') }))
  end
  -- citations of the bibliography in the same brackets stay citations, after the references
  if #others > 0 then
    out:insert(pandoc.Space())
    out:insert(pandoc.Cite(pandoc.Inlines({ pandoc.Str('[@' .. others[1].id .. ']') }), others))
  end
  return out
end

-- A ```mermaid block (or {.mermaid caption="…" #fig:x}) as the picture the editor drew of it, which Spectrum keeps as
-- SPECTRUM_MERMAID_DIR/<sha1 of the code, its whitespace collapsed>.png; a figure when it has a caption. Typst reads
-- it from the project's root. Without the picture the block stays code, with a warning.
local mermaid_dir = os.getenv('SPECTRUM_MERMAID_DIR')

local function mermaid(el)
  if not el.classes:includes('mermaid') then return nil end
  local code = el.text:gsub('%s+', ' '):gsub('^ ', ''):gsub(' $', '')
  local name = pandoc.utils.sha1(code) .. '.png'
  local file = io.open(mermaid_dir .. '/' .. name, 'rb')
  if not file then
    warn('A Mermaid diagram is printed as its code: compile in the editor to draw it, or correct the error it shows.')
    return nil
  end
  file:close()
  local src = is_typst() and '/.spectrum/mermaid/' .. name or mermaid_dir .. '/' .. name
  local caption = el.attributes.caption
  local image = pandoc.Image(caption and {} or { pandoc.Str('Diagram') }, src)
  if not caption then return pandoc.Para({ image }) end
  local inlines = pandoc.utils.blocks_to_inlines(pandoc.read(caption, 'markdown').blocks)
  image.caption = inlines
  return pandoc.Figure(pandoc.Plain({ image }), { long = { pandoc.Plain(inlines) } }, pandoc.Attr(el.identifier))
end

function Pandoc(doc)
  numbered_sections = truthy(doc.meta.numbersections) or truthy(doc.meta['number-sections'])
  -- pandoc's Typst template numbers headings by section-numbering, not by numbersections
  if numbered_sections and is_typst() and not doc.meta['section-numbering'] then doc.meta['section-numbering'] = '1.1.1' end
  if mermaid_dir then doc = doc:walk({ CodeBlock = mermaid }) end
  doc = doc:walk({ Inlines = equations })
  doc = blocks(doc)
  return doc:walk({ Cite = cite })
end
