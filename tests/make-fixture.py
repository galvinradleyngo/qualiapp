# Builds tests/fixtures/messy-paper.docx: a deliberately badly formatted student paper.
import zipfile, os
W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
def esc(t): return t.replace('&', '&amp;').replace('<', '&lt;')
def run(t, b=False, i=False, font=True):
    rpr = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>' if font else ''
    if b: rpr += '<w:b/>'
    if i: rpr += '<w:i/>'
    return f'<w:r><w:rPr>{rpr}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">{esc(t)}</w:t></w:r>'
def p(*runs, jc=None, style=None, extra=''):
    ppr = (f'<w:pStyle w:val="{style}"/>' if style else '') + (f'<w:spacing w:after="160" w:line="259" w:lineRule="auto"/>') + (f'<w:jc w:val="{jc}"/>' if jc else '') + extra
    return f'<w:p><w:pPr>{ppr}</w:pPr>{"".join(runs)}</w:p>'
def blank(): return '<w:p/>'
def pagebreak(): return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
def cell(t): return f'<w:tc><w:tcPr><w:tcW w:w="3000" w:type="dxa"/><w:shd w:val="clear" w:fill="D9E2F3"/></w:tcPr>{p(run(t))}</w:tc>'
def table(rows):
    b = '<w:tblBorders>' + ''.join(f'<w:{s} w:val="single" w:sz="4" w:color="000000"/>' for s in ['top','left','bottom','right','insideH','insideV']) + '</w:tblBorders>'
    return '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/>' + b + '</w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/><w:gridCol w:w="3000"/></w:tblGrid>' + ''.join('<w:tr>' + ''.join(cell(c) for c in r) + '</w:tr>' for r in rows) + '</w:tbl>'
body = []
body += [blank(), blank(), blank(), p(run('Sleep and Memory in Adolescents', b=True), jc='center'), blank(),
         p(run('Maria Santos'), jc='center'), p(run('Department of Psychology, Ateneo de Manila University'), jc='center'),
         p(run('PSY 101: Introduction to Psychology'), jc='center'), p(run('Dr. Reyes'), jc='center'), p(run('October 9, 2026'), jc='center'), pagebreak()]
body += [p(run('Abstract', b=True), jc='center'),
         p(run('This study examined how sleep duration relates to memory in adolescents. Results showed a strong effect, M = 3.2, SD = 1.1, p < .05.'), jc='both'),
         p(run('Keywords: sleep, memory, adolescents')), pagebreak()]
body += [p(run('SLEEP AND MEMORY IN ADOLESCENTS', b=True), jc='center'),
         p(run('INTRODUCTION', b=True), jc='center'),
         p(run('    Sleep matters for learning.  Research by Smith and Lee (2019) found that rest improves recall (Smith & Lee 2019). Other work (Jones, Brown, & Kim, 2020) agrees, and Garcia et. al (2021) extended it.'), jc='both'),
         blank(),
         p(run('Method', b=True)),
         p(run('We recruited 40 participants (n = 40). As shown in Table 3, scores rose, and Figure 2 shows the trend. Table 1 lists the sample.'), jc='both'),
         p(run('Table 3. Descriptive statistics', b=False)),
         table([['Group', 'M', 'SD'], ['Sleep', '3.2', '1.1'], ['Control', '2.1', '0.9']]),
         p(run('Note: Values are rounded.')),
         blank(),
         p(run('Table 1'), extra=''), p(run('sample characteristics', i=True)),
         table([['Age', 'n', '%'], ['14', '20', '50']]),
         blank(),
         p(run('Results', b=True)),
         p(run('Smith (2019) stated that "sleep consolidates memory across the night in ways that daytime rest cannot replicate at all" (Smith, 2019). The effect was large, t(38) = 2.5, p = .02.'), jc='both'),
         pagebreak(),
         p(run('Bibliography', b=True), jc='center'),
         p(run('Smith, J. A. and Lee, R. T. (2019). Sleep and recall in teens. Journal of Sleep, 12(3), 45-67.')),
         p(run('Brown, K. (2020). Memory basics. Academic Press.')),
         p(run('Jones, P., Brown, K., & Kim, S. (2020). Rest and learning. Education Review, 8(1), 1-10.'))]
doc = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document {W}><w:body>{"".join(body)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1000" w:bottom="1000" w:left="1800" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>'
styles = f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles {W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/></w:style></w:styles>'
ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'
rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
drels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'
out = os.path.join(os.path.dirname(__file__), 'fixtures', 'messy-paper.docx')
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', ct); z.writestr('_rels/.rels', rels)
    z.writestr('word/document.xml', doc); z.writestr('word/_rels/document.xml.rels', drels); z.writestr('word/styles.xml', styles)
print('wrote', out)
