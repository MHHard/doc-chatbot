import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportMarkdown(content: string, filename: string) {
  downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8' }), filename)
}

export async function exportPdf(el: HTMLElement, filename: string) {
  const canvas = await html2canvas(el, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    logging: false,
  })
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 15
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgW = pageW - margin * 2
  const imgH = (canvas.height / canvas.width) * imgW
  const usableH = pageH - margin * 2

  let remaining = imgH
  let srcY = 0
  let first = true
  while (remaining > 0) {
    if (!first) pdf.addPage()
    first = false
    const sliceH = Math.min(remaining, usableH)
    const slicePct = sliceH / imgH
    const srcH = canvas.height * slicePct

    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = srcH
    slice.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)
    pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, imgW, sliceH)
    srcY += srcH
    remaining -= sliceH
  }
  pdf.save(filename)
}

export async function exportDocx(content: string, filename: string) {
  const children = content.split('\n').map(line => {
    const h3 = line.match(/^### (.+)/)
    if (h3) return new Paragraph({ text: h3[1], heading: HeadingLevel.HEADING_3 })
    const h2 = line.match(/^## (.+)/)
    if (h2) return new Paragraph({ text: h2[1], heading: HeadingLevel.HEADING_2 })
    const h1 = line.match(/^# (.+)/)
    if (h1) return new Paragraph({ text: h1[1], heading: HeadingLevel.HEADING_1 })
    if (line.trim() === '') return new Paragraph({ text: '' })

    // Inline bold/italic — split on ** and *
    const parts: TextRun[] = []
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(line)) !== null) {
      if (m.index > last) parts.push(new TextRun(line.slice(last, m.index)))
      if (m[2]) parts.push(new TextRun({ text: m[2], bold: true }))
      else if (m[3]) parts.push(new TextRun({ text: m[3], italics: true }))
      else if (m[4]) parts.push(new TextRun({ text: m[4], font: 'Courier New' }))
      last = m.index + m[0].length
    }
    if (last < line.length) parts.push(new TextRun(line.slice(last)))
    return new Paragraph({ children: parts.length ? parts : [new TextRun(line)] })
  })

  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, filename)
}
