// src/components/KMLUpload.jsx
export default function KMLUpload({ onFileRead }) {
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => onFileRead(event.target.result);
        reader.readAsText(file);
    };

    return (
        <label className="bg-gradient-to-r from-padrao-100 to-padrao-900 px-3 py-1 text-white rounded shadow cursor-pointer">
            Abrir KML
            <input type="file" accept=".kml" onChange={handleFileUpload} className="hidden" />
        </label>
    );
}
