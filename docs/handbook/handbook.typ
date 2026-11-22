// The Spectrum handbook. Compile from the repository root:
//   typst compile --root . --font-path src-tauri/resources/fonts/cjk docs/handbook/handbook.typ

#import "template.typ": *

#show: handbook.with(
  title: [Spectrum],
  subtitle: [Handbook],
  author: "Longkai Li",
  version: "2.6.3",
  date: datetime(year: 2026, month: 11, day: 17),
)

#include "chapters/00-about.typ"
#include "chapters/01-getting-started.typ"
#include "chapters/02-writing.typ"
#include "chapters/03-assistant.typ"
#include "chapters/04-references.typ"
#include "chapters/05-composer.typ"
#include "chapters/06-circuits.typ"
#include "chapters/07-structures.typ"
#include "chapters/08-vectors.typ"
#include "chapters/09-flow.typ"
#include "chapters/10-plots.typ"
#include "chapters/11-forms.typ"
#include "chapters/12-symbols.typ"
