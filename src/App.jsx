import PdfViewer from "./components/PdfViewer";
import { AnnotationProvider } from "./context/AnnotationContext";

export default function App() {
  return (
    <AnnotationProvider>
      <PdfViewer />
    </AnnotationProvider>
  );
}