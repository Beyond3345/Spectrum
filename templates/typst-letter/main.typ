// Document
#set document(title: [Application for the Graduate Engineer position], author: "Alex Morgan") // the title and author, also shown in the PDF's properties

// Page
#set page(paper: "a4", margin: 25mm, numbering: none) // A4, 25 mm margins all round, no page number on a letter
#set text(size: 11pt, lang: "en", region: "AU") // 11 pt text; Australian English, and en-AU in the PDF
#set par(justify: false)                        // a ragged right margin, as letters have

Alex Morgan \
12 Wattle Street \
Canberra ACT 2600 \
alex.morgan\@example.com

#v(1cm)

// Today's date; type the date instead to fix it, e.g. 3 November 2026
#datetime.today().display("[day padding:none] [month repr:long] [year]")

#v(1cm)

The Hiring Manager \
Example Company \
GPO Box 1234 \
Sydney NSW 2001

#v(1.5cm)

Dear Hiring Manager,

I am writing to apply for the Graduate Engineer position advertised on your website. I recently completed a degree in engineering at the University of Sydney, where I studied structural design and materials.

In my final project I led a team of four students to design a footbridge for a local council. The design met the brief and came in under budget. It taught me how to keep a project moving when the requirements change.

I would welcome the chance to discuss how I could contribute to your team. Thank you for considering my application.

#v(1cm)

Yours sincerely,

#v(1.5cm)

Alex Morgan
