; Spectrum in Explorer's Open with for other TeX files, Typst and Markdown documents, without
; becoming their default. Tauri's installer makes itself the default for every extension in
; fileAssociations, whatever its rank, so tauri.windows.conf.json keeps only .tex, .ltx and .bib
; there, and the extensions of tauri.conf.json's other three are listed here instead.

!macro SPECTRUM_PROGID PROGID DESCRIPTION
  WriteRegStr SHCTX "Software\Classes\${PROGID}" "" "${DESCRIPTION}"
  WriteRegStr SHCTX "Software\Classes\${PROGID}\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\${PROGID}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
!macroend

; listed under Open with, leaving the extension's default as it is
!macro SPECTRUM_OPEN_WITH EXT PROGID
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}" ""
!macroend

!macro SPECTRUM_NOT_OPEN_WITH EXT PROGID
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${PROGID}"
!macroend

!macro SPECTRUM_OPEN_WITH_ALL MACRO
  !insertmacro ${MACRO} "sty" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "cls" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "clo" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "dtx" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "ins" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "bst" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "bbx" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "cbx" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "lbx" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "dbx" "Spectrum.TeXFile"
  !insertmacro ${MACRO} "typ" "Spectrum.Typst"
  !insertmacro ${MACRO} "md" "Spectrum.Markdown"
  !insertmacro ${MACRO} "markdown" "Spectrum.Markdown"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro SPECTRUM_PROGID "Spectrum.TeXFile" "TeX package, class or style"
  !insertmacro SPECTRUM_PROGID "Spectrum.Typst" "Typst document"
  !insertmacro SPECTRUM_PROGID "Spectrum.Markdown" "Markdown document"
  !insertmacro SPECTRUM_OPEN_WITH_ALL SPECTRUM_OPEN_WITH
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro SPECTRUM_OPEN_WITH_ALL SPECTRUM_NOT_OPEN_WITH
  DeleteRegKey SHCTX "Software\Classes\Spectrum.TeXFile"
  DeleteRegKey SHCTX "Software\Classes\Spectrum.Typst"
  DeleteRegKey SHCTX "Software\Classes\Spectrum.Markdown"
!macroend
