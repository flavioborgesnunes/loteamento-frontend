import { useState } from 'react';
import MapComponent from '../../components/mapbox/MapBoxComponent';

export default function EstudoMapa() {
    const [carregandoRestricoes, setCarregandoRestricoes] = useState(false);
    const [erroRestricao, setErroRestricao] = useState("");

    return (
        <div className='flex flex-col h-full'>
            <MapComponent
                className="rounded-xl mt-10 mb-20"
                setCarregandoRestricoes={setCarregandoRestricoes}
                setErroRestricao={setErroRestricao}
            />

            {carregandoRestricoes && (
                <p className="mt-2 text-2xl text-blue-600 animate-pulse">🔄 Carregando restrições...</p>
            )}
            {erroRestricao && (
                <p className="mt-2 text-xl text-red-600">⚠️ {erroRestricao}</p>
            )}
        </div>
    );
}
