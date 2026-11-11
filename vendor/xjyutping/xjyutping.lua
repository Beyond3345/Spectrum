-- xjyutping.lua -- the LuaLaTeX side of xjyutping.sty.
--
-- Copyright (C) 2026 by the xjyutping authors.
-- This work may be distributed and/or modified under the conditions of the
-- LaTeX Project Public License, version 1.3c or later.
--
-- Under XeLaTeX the package builds each cell while xeCJK typesets the
-- character.  LuaTeX has no such per-character hook, so the TeX side builds
-- the ruby of each character in advance (xjyutping@lua@store) and tags the
-- character's glyph with an attribute.  After LuaTeX-ja has added its glue
-- and line-break penalties (in pre_linebreak_filter and hpack_filter), the
-- callback below wraps each tagged glyph into its cell:
--
--   \hbox{ \kern<pad> <ruby overlay> <glyph> \kern<pad> }
--
-- The right pad is left out before punctuation that should hug the
-- character; the glue after a cell becomes the stretch of hsep, as under
-- XeLaTeX.  A Chinese character typeset while annotation is on but without
-- a reading from the preprocessor (text from a macro) is annotated here
-- without context, by running TeX code with tex.runtoks: the scope
-- attribute of such a glyph names a snapshot of the package's settings where
-- it was typeset, and the size attribute gives the text size there.

local M = {}

local cell_attr  = luatexbase.new_attribute('xjyutping@cell')
local scope_attr = luatexbase.new_attribute('xjyutping@scope')
local size_attr  = luatexbase.new_attribute('xjyutping@size')
local UNSET = -0x7FFFFFFF

local D = node.direct
local todirect, tonode = D.todirect, D.tonode
local getid, getnext, getlist = D.getid, D.getnext, D.getlist
local getchar, getfont, getwidth = D.getchar, D.getfont, D.getwidth
local getattr, setattr, unsetattr = D.has_attribute, D.set_attribute, D.unset_attribute
local getfield, setfield, setglue = D.getfield, D.setfield, D.setglue
local setlink, setnext, remove, hpack = D.setlink, D.setnext, D.remove, D.hpack
local insert_before, insert_after = D.insert_before, D.insert_after

local GLYPH, HLIST, GLUE, PENALTY, KERN, WHATSIT, RULE, DISC, MARK, INS
  = node.id 'glyph', node.id 'hlist', node.id 'glue', node.id 'penalty',
    node.id 'kern', node.id 'whatsit', node.id 'rule', node.id 'disc',
    node.id 'mark', node.id 'ins'
local LOCALPAR, DIR = node.id 'local_par', node.id 'dir'

-- LuaTeX-ja tags the glue it inserts; 68 is the glue between two Chinese
-- characters (its KANJI_SKIP).
local KANJI_SKIP = (luatexja and luatexja.icflag_table
                    and luatexja.icflag_table.KANJI_SKIP) or 68
local function icflag(n)
  local a = luatexbase.attributes['ltj@icflag']
  return a and getattr(n, a)
end

-- Punctuation, as in xeCJK's classes FullLeft (opening) and FullRight
-- (closing, full stops, colons ...).  The package asks for these too.
M.fullleft = {}
M.fullright = {}
for _, c in ipairs {
  0x2018, 0x201C, 0x3008, 0x300A, 0x300C, 0x300E, 0x3010, 0x3014, 0x3016,
  0x3018, 0x301A, 0x301D, 0xFE17, 0xFE35, 0xFE37, 0xFE39, 0xFE3B, 0xFE3D,
  0xFE3F, 0xFE41, 0xFE43, 0xFE47, 0xFE59, 0xFE5B, 0xFE5D, 0xFF08, 0xFF3B,
  0xFF5B, 0xFF5F, 0xFF62, 0xFE69, 0xFF04, 0xFFE1, 0xFFE5, 0xFFE6 } do
  M.fullleft[c] = true
end
for _, c in ipairs {
  0x00B7, 0x2019, 0x201D, 0x2013, 0x2014, 0x2025, 0x2026, 0x2027, 0x2E3A,
  0x3001, 0x3002, 0x3009, 0x300B, 0x300D, 0x300F, 0x3011, 0x3015, 0x3017,
  0x3019, 0x301B, 0x301E, 0x301F, 0xFE11, 0xFE12, 0xFE18, 0xFE36, 0xFE38,
  0xFE3A, 0xFE3C, 0xFE3E, 0xFE40, 0xFE42, 0xFE44, 0xFE48, 0xFE50, 0xFE52,
  0xFE5A, 0xFE5C, 0xFE5E, 0xFF09, 0xFF0C, 0xFF0E, 0xFF3D, 0xFF5D, 0xFF60,
  0xFF61, 0xFF63, 0xFF64, 0x30FB, 0xFE54, 0xFE55, 0xFF1A, 0xFF1B, 0xFF65,
  0x16FE0, 0xFE15, 0xFE16, 0xFE56, 0xFE57, 0xFF01, 0xFF1F, 0xFE10, 0xFE13,
  0xFE14, 0xFE6A, 0xFF05, 0xFFE0, 0x301C, 0x30A0, 0xFF5E } do
  M.fullright[c] = true
end
-- For the preprocessor: the class of character code c, as a string.
function M.class(c)
  if M.fullright[c] then tex.sprint('FullRight')
  elseif M.fullleft[c] then tex.sprint('FullLeft') end
end
-- Before these the pad is kept (closing brackets and quotes) ...
local closing = {}
for _, c in utf8.codes '」』）】》〉〕］｝”’〗〙〟｠' do closing[c] = true end
-- ... and before these it is kept only where the line breaks.
local long = {}
for _, c in utf8.codes '—…‥⸺' do long[c] = true end

-- The cells built by the TeX side: id -> { box, pad, hsep, nopad }.
local cells, last = {}, 0
-- Snapshots of the package's settings: id -> token list, and its key -> id.
local snaps, snapid = {}, {}

local function define(name, fn)
  local id = luatexbase.new_luafunction(name)
  lua.get_functions_table()[id] = fn
  token.set_lua(name, id, 'protected')
end

-- \xjyutping@lua@store <box> <pad> <hsep glue>: tag what follows with the
-- new cell; @storeonly: the same for a character already typeset.
local function store(settag)
  local b = token.scan_int()
  local pad = token.scan_int()
  local g = token.scan_glue()
  last = last + 1
  cells[last] = {
    box = D.copy(todirect(tex.getbox(b))), pad = pad,
    hsep = { g.stretch, g.shrink, g.stretch_order, g.shrink_order },
  }
  node.free(g)
  if settag then tex.setattribute(cell_attr, last) end
  M.last = last
end
define('xjyutping@lua@store', function () store(true) end)
define('xjyutping@lua@storeonly', function () store(false) end)
-- after a character whose right pad must be dropped (\__xjyutping_nopad:)
define('xjyutping@lua@nopad', function ()
  if cells[last] then cells[last].nopad = true end
end)
-- \xjyutping@lua@on {<settings>}: annotation is on, with these settings
define('xjyutping@lua@on', function ()
  local t = token.scan_toks()
  local key = {}
  for i, tok in ipairs(t) do key[i] = tok.csname or (tok.command .. ':' .. tok.mode) end
  key = table.concat(key, ' ')
  local id = snapid[key]
  if not id then
    id = #snaps + 1
    snaps[id], snapid[key] = t, id
  end
  tex.setattribute(scope_attr, id)
end)
-- \xjyutping@lua@restore <id>: put the settings of snapshot <id> back
define('xjyutping@lua@restore', function ()
  local t = snaps[token.scan_int()]
  if t then token.put_next(t) end
end)
-- \xjyutping@lua@size <dimen>: the text size (\f@size)
define('xjyutping@lua@size', function ()
  tex.setattribute(size_attr, token.scan_dimen())
end)
define('xjyutping@lua@off', function ()
  tex.setattribute(scope_attr, UNSET)
  tex.setattribute(cell_attr, UNSET)
end)

-- The glyph of a character as LuaTeX-ja leaves it: a glyph, or a glyph
-- packed alone in an hbox (to give it its JFM width).
local function glyph_of(n)
  local id = getid(n)
  if id == GLYPH then return n end
  -- (a cell of ours is tagged -1; LuaTeX-ja's box copies the glyph's tag)
  if id == HLIST and (getattr(n, cell_attr) or 0) >= 0 then
    local h = getlist(n)
    if h and getid(h) == GLYPH and not getnext(h) then return h end
  end
end

-- The next visible object from n on (skipping glue, penalties, kerns and
-- invisible nodes).
local function next_object(n)
  while n do
    local id = getid(n)
    if id == GLUE or id == PENALTY or id == KERN or id == WHATSIT
       or id == MARK or id == INS or id == LOCALPAR or id == DIR
       or (id == RULE and getwidth(n) == 0) then
      n = getnext(n)
    else
      return n
    end
  end
end

local function new_kern(w)
  local k = D.new(KERN)
  setfield(k, 'kern', w)
  return k
end

-- A character with no cell but typeset in a scope: build one now, with the
-- settings and the size of the place where it was typeset.
local function nocontext(g)
  local ch = utf8.char(getchar(g))
  if not (token.get_macro('xjp@c@' .. ch) or token.get_macro('xjp@u@' .. ch)) then
    return
  end
  local size = getattr(g, size_attr)
  if not size then
    local f = font.getfont(getfont(g))
    size = f and f.size or tex.sp('10pt')
  end
  M.last = nil
  local ok, err = pcall(tex.runtoks, function ()
    tex.sprint(luatexbase.registernumber('catcodetable@atletter'),
      string.format('\\xjyutping@lua@nocontext{%s}{%.4f}{%d}',
                    ch, size / 65536, getattr(g, scope_attr) or 0))
  end)
  if not ok then
    texio.write_nl('log', 'xjyutping: ' .. tostring(err))
    return
  end
  return M.last
end

-- Wrap the character object n (glyph g, cell id) into its cell.
local function wrap(head, n, g, id)
  local c = cells[id]
  cells[id] = nil
  for _, x in ipairs { g, n } do
    unsetattr(x, cell_attr)
    unsetattr(x, scope_attr)
  end
  local right, brk = c.pad, nil
  local o = next_object(getnext(n))
  local og = o and glyph_of(o)
  local punct = og and M.fullright[getchar(og)]
  if c.nopad then right = 0 end
  if punct and not closing[getchar(og)] then
    right = 0
    if long[getchar(og)] then
      -- A line may break before a long mark: find that break and move it
      -- into a discretionary whose pre-break text is the pad, so the pad
      -- stays at the end of the line if the line breaks there.
      local p, prev = getnext(n), n
      while p and p ~= o do
        local nx, pid = getnext(p), getid(p)
        if pid == PENALTY and getfield(p, 'penalty') < 10000 then
          brk = math.min(brk or 10000, getfield(p, 'penalty'))
          setfield(p, 'penalty', 10000)
        elseif pid == GLUE then
          local qid = getid(prev)
          if not (qid == GLUE or qid == KERN or qid == PENALTY) then
            brk = math.min(brk or 10000, 0)
            local pen = D.new(PENALTY)
            setfield(pen, 'penalty', 10000)
            head = insert_before(head, p, pen)
          end
        end
        prev, p = p, nx
      end
    end
  end
  local after = getnext(n)
  head = remove(head, n)
  setnext(n, nil)
  local left = new_kern(c.pad)
  setlink(left, c.box, n)
  if right ~= 0 then setlink(n, new_kern(right)) end
  local cell = hpack(left)
  setattr(cell, cell_attr, -1)
  if not head then
    head = cell
  elseif after then
    head = insert_before(head, after, cell)
  else
    head = insert_after(head, D.tail(head), cell)
  end
  if brk then
    local d = D.new(DISC)
    D.setdisc(d, new_kern(c.pad), nil, nil)
    setfield(d, 'penalty', brk)
    head = insert_after(head, cell, d)
  end
  -- The glue to the next character: only the stretch (and shrink) of hsep,
  -- its natural part being inside the cells; before punctuation none at
  -- all, so the mark hugs its character as under XeLaTeX.
  local p = getnext(cell)
  while p do
    local pid = getid(p)
    if not (pid == PENALTY or pid == WHATSIT or pid == DISC or pid == KERN
            or pid == GLUE) then
      break
    end
    if pid == GLUE and icflag(p) == KANJI_SKIP then
      if punct then
        setglue(p, 0, 0, 0, 0, 0)
      else
        local h = c.hsep
        setglue(p, 0, h[1], h[2], h[3], h[4])
      end
      break
    end
    p = getnext(p)
  end
  return head, cell
end

local function process(head)
  head = todirect(head)
  local n = head
  while n do
    local g = glyph_of(n)
    local id = g and getattr(g, cell_attr)
    if g and not (id and id > 0 and cells[id])
       and (getattr(g, scope_attr) or 0) > 0 then
      id = nocontext(g)
      unsetattr(g, scope_attr)
    end
    if id and id > 0 and cells[id] then
      local cell
      head, cell = wrap(head, n, g, id)
      n = getnext(cell)
    else
      n = getnext(n)
    end
  end
  return tonode(head)
end

luatexbase.add_to_callback('pre_linebreak_filter', process, 'xjyutping')
luatexbase.add_to_callback('hpack_filter', process, 'xjyutping')

return M
