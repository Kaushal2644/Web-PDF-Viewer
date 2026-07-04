# 📄 PDF Annotator

A modern, high-performance **frontend-only PDF Viewer** built with **React**, **Vite**, **Tailwind CSS**, and **PDF.js**. The application provides a smooth PDF viewing experience with editable annotations, optimized rendering for large PDF documents, and an intuitive user interface.

---

## ✨ Features

### 📖 PDF Viewer
- Open PDF files from local storage
- Multi-page continuous scrolling
- High-quality PDF rendering using PDF.js
- Zoom In / Zoom Out
- Fit Width
- Ctrl + Mouse Wheel zoom
- Responsive layout

### ⚡ Performance Optimizations
- Virtualized page rendering using `IntersectionObserver`
- Lazy loading of pages
- Render task cancellation
- Optimized canvas rendering
- Smooth scrolling experience
- Efficient memory usage for large PDFs

### 🖊 Annotation Tools
- Highlight
- Underline
- StrikeThrough
- Rectangle
- Oval
- Arrow
- Cloud

### ✏️ Annotation Editing
- Select annotations
- Move annotations
- Resize annotations
- Delete annotations
- Change annotation color
- Adjustable stroke width

### 💾 Persistence
- Auto-save annotations using LocalStorage
- Restore annotations after page refresh

### 🎨 User Interface
- Modern dark theme
- Responsive design
- Professional toolbar
- Smooth user experience

---

# 🛠 Tech Stack

| Technology | Purpose |
|------------|---------|
| React | Frontend Framework |
| Vite | Build Tool |
| Tailwind CSS v4 | Styling |
| PDF.js (`pdfjs-dist`) | PDF Rendering |
| React Context API | State Management |
| SVG | Annotation Layer |
| HTML5 Canvas | PDF Rendering |

---

# 📂 Project Structure

```text
src/
│
├── components/
│   ├── AnnotationOverlay.jsx
│   ├── PdfPage.jsx
│   ├── PdfTextLayer.jsx
│   ├── PdfViewer.jsx
│   └── Toolbar.jsx
│
├── context/
│   └── AnnotationContext.jsx
│
├── App.jsx
├── main.jsx
└── index.css
```

---

# 🚀 Installation

Clone the repository

```bash
git clone https://github.com/your-username/pdf-annotator.git
```

Navigate to the project

```bash
cd pdf-annotator
```

Install dependencies

```bash
npm install
```

Start the development server

```bash
npm run dev
```

---

# 🏗 Build for Production

Create production build

```bash
npm run build
```

Preview production build

```bash
npm run preview
```

---

# 🎯 Performance Highlights

- Virtualized rendering for large PDF documents
- Lazy loading of pages
- High DPI canvas rendering
- Smooth zooming
- Efficient memory management
- Optimized annotation rendering
- Minimal unnecessary React re-renders

---

# 🧠 Architecture

The application follows a modular component-based architecture.

### PdfViewer
Handles:
- PDF loading
- Zoom controls
- Viewer layout
- Page rendering

### PdfPage
Responsible for:
- Rendering individual pages
- Virtualization
- Canvas rendering
- Text layer integration

### PdfTextLayer
Provides:
- Native browser text selection
- Text markup support
- Highlight positioning

### AnnotationOverlay
Handles:
- Drawing annotations
- Editing annotations
- Shape rendering
- Selection

### Toolbar
Provides:
- Tool selection
- Color picker
- Stroke width controls

### AnnotationContext
Manages:
- Global annotation state
- Active tool
- Selected annotation
- Undo/Redo history


# 🔮 Future Improvements

- Search within PDF
- Thumbnail sidebar
- Page rotation
- Freehand drawing
- Sticky notes
- Collaborative annotations
- Annotation export/import
- Keyboard shortcut customization

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature-name
```

3. Commit your changes

```bash
git commit -m "Add new feature"
```

4. Push to GitHub

```bash
git push origin feature-name
```

5. Open a Pull Request

---

# 📄 License

This project is licensed under the **MIT License**.


⭐ If you found this project useful, please consider giving it a **Star** on GitHub.
