# Builds small PDFs in tests/fixtures for the Citation Generator's PDF reading.
import os
def pdf(path, lines, info=None):
    # lines: [(size, y, text)]
    stream = 'BT\n' + ''.join(f'/F1 {s} Tf 1 0 0 1 60 {y} Tm ({t}) Tj\n' for s, y, t in lines) + 'ET'
    objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            f'<< /Length {len(stream)} >>\nstream\n{stream}\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    if info:
        objs.append('<< ' + ' '.join(f'/{k} ({v})' for k, v in info.items()) + ' >>')
    out = '%PDF-1.4\n'; offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += f'{i} 0 obj\n{o}\nendobj\n'
    x = len(out)
    out += f'xref\n0 {len(objs)+1}\n0000000000 65535 f \n' + ''.join(f'{o:010d} 00000 n \n' for o in offs)
    out += f'trailer\n<< /Size {len(objs)+1} /Root 1 0 R' + (f' /Info {len(objs)} 0 R' if info else '') + f' >>\nstartxref\n{x}\n%%EOF\n'
    open(path, 'w', encoding='latin-1').write(out)
d = os.path.join(os.path.dirname(__file__), 'fixtures')
body = 'Body text of the document continues here with ordinary sentences about the study design and findings.'
pdf(os.path.join(d, 'report-ph.pdf'), [(24, 700, 'Mental Health Services in the Philippines'), (11, 660, 'Published March 12, 2021'), (11, 640, body), (11, 620, body)],
    {'Author': 'Department of Health', 'CreationDate': 'D:20210312000000Z'})
pdf(os.path.join(d, 'plain-report.pdf'), [(22, 700, 'Community Learning Hubs Evaluation'), (11, 660, body), (11, 640, body)],
    {'Producer': 'Microsoft Word', 'Author': 'admin', 'CreationDate': 'D:20190601000000Z'})
pdf(os.path.join(d, 'with-doi.pdf'), [(20, 700, 'Array programming with NumPy'), (10, 670, 'https://doi.org/10.1038/s41586-020-2649-2'), (11, 640, body)])
print('ok')
