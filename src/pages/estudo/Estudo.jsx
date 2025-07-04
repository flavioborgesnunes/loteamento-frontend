import { useAuthStore } from '../../store/auth';
import { ArrowLeft, GripVertical } from 'lucide-react';
import MapComponent from '../../components/MapBoxComponent';
import { useState } from 'react';
import ImgEstudo from './images/img-estudo.png'

function Estudo() {

    const [carregandoRestricoes, setCarregandoRestricoes] = useState(false);
    const [erroRestricao, setErroRestricao] = useState("");


    return (
        <>
            {/* Mapa MapBox */}
            <div className='flex justify-center'>

                <MapComponent
                    className="rounded-xl mt-10 mb-20"
                    setCarregandoRestricoes={setCarregandoRestricoes}
                    setErroRestricao={setErroRestricao}
                />
            </div>

            <div className="flex justify-center items-center">

                {carregandoRestricoes && (
                    <p className="mt-2 text-2xl text-blue-600 animate-pulse">🔄 Buscando dados urbanísticos da cidade...</p>
                )}

                {erroRestricao && (
                    <p className="mt-2 text-xl text-red-600">⚠️ {erroRestricao}</p>
                )}

            </div>

            <div className="mt-6">
                <label className="block font-medium mb-1">Resposta da IA:</label>
                <div id="resposta-ia" className="text-gray-700 whitespace-pre-line bg-gray-100 p-3 rounded shadow-sm text-xl italic" />
            </div>

            <div className="grid grid-cols-2 gap-4 mt-8 p-4 bg-white rounded shadow">
                <div>
                    <label className="block font-medium mb-1" htmlFor="cidade">Cidade</label>
                    <input name="cidade" id="cidade" className="border p-2 w-full rounded" readOnly />
                </div>
                <div>
                    <label className="block font-medium mb-1" htmlFor="estado">Estado</label>
                    <input name="estado" id="estado" className="border p-2 w-full rounded" readOnly />
                </div>
                <div>
                    <label className="block font-medium mb-1" htmlFor="codigo_ibge">Código IBGE</label>
                    <input name="codigo_ibge" id="codigo_ibge" className="border p-2 w-full rounded" readOnly />
                </div>
                <div>
                    <label htmlFor="campo-area-minima">Área mínima do lote</label>
                    <input id="campo-area-minima" readOnly className="border p-2 w-full rounded" />
                </div>
                <div>
                    <label htmlFor="campo-largura-calcada">Largura da calçada</label>
                    <input id="campo-largura-calcada" readOnly className="border p-2 w-full rounded" />
                </div>
                <div>
                    <label htmlFor="campo-recuo-frontal">Recuo frontal</label>
                    <input id="recuo_frontal" readOnly className="border p-2 w-full rounded" />
                </div>
                <div>
                    <label htmlFor="campo-recuo-lateral">Recuo lateral</label>
                    <input id="recuo_lateral" readOnly className="border p-2 w-full rounded" />
                </div>
                <div>
                    <label htmlFor="campo-app">APP margem de rio</label>
                    <input id="campo-app" readOnly className="border p-2 w-full rounded" />
                </div>
            </div>



            {/* <form className="w-full mt-10 shadow-md bg-white rounded-2xl p-5">
                <div className="grid grid-cols-2">
                    <div className="px-4">
                        <ArrowLeft />
                        <div className='flex mt-5 items-center mb-6'>
                            <GripVertical className='text-gray-400 w-8 h-8' />
                            <p className='text-gray-300 font-bold text-2xl ml-2'>Nome do Estudo</p>
                        </div>

                        <div className="flex flex-wrap gap-4">
                            <div className="w-full">
                                <label className="block text-sm font-medium mb-1" htmlFor="nome">Nome do Estudo:</label>
                                <input
                                    type="text"
                                    id="nome"
                                    placeholder='Digite o nome do Estudo'
                                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                                />
                            </div>

                            <div className='flex justify-between gap-5'>
                                <div className="w-[60%]">
                                    <label className="block text-sm font-medium mb-1" htmlFor="responsavel">Responsável Técnico:</label>
                                    <input
                                        type="text"
                                        id="responsavel"
                                        placeholder='Nome do Responsável'
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>

                                <div className="w-[40%]">
                                    <label className="block text-sm font-medium mb-1" htmlFor="matricula">Matrícula do terreno:</label>
                                    <input
                                        type="text"
                                        id="matricula"
                                        placeholder='Nº da Matrícula'
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>
                            </div>

                            <div className='flex justify-between gap-5'>
                                <div className="w-[60%]">
                                    <label className="block text-sm font-medium mb-1" htmlFor="estado">Estado:</label>
                                    <input
                                        type="text"
                                        id="estado"
                                        placeholder='Digite o nome do Estado'
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>

                                <div className="w-[40%]">
                                    <label className="block text-sm font-medium mb-1" htmlFor="cidade">Cidade:</label>
                                    <input
                                        type="text"
                                        id="cidade"
                                        placeholder='Digite o nome da Cidade'
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    />
                                </div>
                            </div>

                            <div className="w-full">
                                <label className="block text-sm font-medium mb-1" htmlFor="observacoes">Observações Internas:</label>
                                <textarea
                                    id="observacoes"
                                    rows="4"
                                    placeholder='Comentários importantes'
                                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <img src={ImgEstudo} alt="" />
                    </div>

                    <div />
                </div>
            </form> */}
        </>
    );
}

export default Estudo;
