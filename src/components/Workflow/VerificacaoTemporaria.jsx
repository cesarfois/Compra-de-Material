import React, { useState } from 'react';
import { FaRobot, FaCopy, FaCheck } from 'react-icons/fa';
import { docuwareService } from '../../services/docuwareService';
import axios from 'axios';
import { copyToClipboard } from '../../utils/clipboard';

// Auxiliares para extrair dados
const getDocFieldValue = (doc, fieldName) => {
    if (!doc || !doc.Fields) return '';
    const field = doc.Fields.find(f => f.FieldName === fieldName);
    if (!field) return '';
    return field.Item || field.Value || '';
};

const getDocumentNumber = (doc) => {
    if (!doc) return '';
    const fieldsToTry = [
        'NO_DOCUMENTO', 'NO_PEDIDO___REFERENCIA', 'NO_TICKET',
        'NUMERO_DOCUMENTO', 'NUMERO', 'N_DOCUMENTO', 'REFERENCIA',
        'NO_VGR', 'NO_ES', 'NO_ECL', 'NO_ENCOMENDA', 'NO_ECF', 'NO_OCE'
    ];
    for (const f of fieldsToTry) {
        const val = getDocFieldValue(doc, f);
        if (val) return val;
    }
    return '';
};

const VerificacaoTemporaria = ({ documents, documentProgress, selectedCabinet }) => {
    const [loadingAI, setLoadingAI] = useState({});
    const [aiSummaries, setAiSummaries] = useState({});
    const [copiedStates, setCopiedStates] = useState({});

    // Filtra apenas os pedidos ativos (não concluídos)
    const activeDocuments = documents.filter(doc => {
        const prog = documentProgress[doc.Id];
        return prog && !prog.isFinished;
    });

    const handleGenerateSummary = async (doc) => {
        const docId = doc.Id;
        setLoadingAI(prev => ({ ...prev, [docId]: true }));
        setAiSummaries(prev => ({ ...prev, [docId]: '' }));

        try {
            // 1. Download do documento (Blob)
            const fileBlob = await docuwareService.downloadDocument(selectedCabinet, docId);

            // 2. Preparar FormData para enviar ao proxy
            const formData = new FormData();
            formData.append('file', fileBlob, `document_${docId}.pdf`);

            // 3. Chamar a API de IA
            const response = await axios.post('/api/ai/analyze-document', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data'
                },
                timeout: 120000 // 2 minutos de timeout para a IA
            });

            if (response.data && response.data.summary) {
                setAiSummaries(prev => ({ ...prev, [docId]: response.data.summary }));
            } else {
                setAiSummaries(prev => ({ ...prev, [docId]: 'Não foi possível gerar o resumo. (Resposta vazia)' }));
            }
        } catch (error) {
            console.error('Erro ao gerar resumo AI:', error);
            const errorMsg = error.response?.data?.error || error.message;
            setAiSummaries(prev => ({ ...prev, [docId]: `Erro: ${errorMsg}` }));
        } finally {
            setLoadingAI(prev => ({ ...prev, [docId]: false }));
        }
    };

    const handleCopy = (docId, text) => {
        copyToClipboard(text);
        setCopiedStates(prev => ({ ...prev, [docId]: true }));
        setTimeout(() => {
            setCopiedStates(prev => ({ ...prev, [docId]: false }));
        }, 3000);
    };

    const handleSummaryChange = (docId, newText) => {
        setAiSummaries(prev => ({ ...prev, [docId]: newText }));
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mt-6">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <div>
                    <h2 className="text-xl font-bold text-gray-800">Verificação Temporária de Pedidos</h2>
                    <p className="text-sm text-gray-500 mt-1">Consulte pedidos em andamento e utilize a IA para gerar resumos instantâneos.</p>
                </div>
                <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-lg font-semibold text-sm">
                    {activeDocuments.length} Pedidos Ativos
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm">
                            <th className="p-4 font-semibold w-48">Referência</th>
                            <th className="p-4 font-semibold">Requerente</th>
                            <th className="p-4 font-semibold">Data de início</th>
                            <th className="p-4 font-semibold">Etapa atual</th>
                            <th className="p-4 font-semibold w-1/3 min-w-[400px]">Análise IA</th>
                        </tr>
                    </thead>
                    <tbody>
                        {activeDocuments.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-gray-500">
                                    Nenhum pedido ativo encontrado no momento.
                                </td>
                            </tr>
                        ) : (
                            activeDocuments.map(doc => {
                                const prog = documentProgress[doc.Id];
                                const docNum = getDocumentNumber(doc) || 'Sem Nº';
                                const requester = getDocFieldValue(doc, 'REQUERENTE') || '-';
                                const entryDate = prog?.entryDate ? new Date(prog.entryDate).toLocaleDateString('pt-BR') : '-';
                                const activeTaskName = prog?.activeTaskName || 'Processando...';

                                const isLoading = loadingAI[doc.Id];
                                const summary = aiSummaries[doc.Id];
                                const isCopied = copiedStates[doc.Id];

                                return (
                                    <tr key={doc.Id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="p-4 font-medium text-gray-900">{docNum}</td>
                                        <td className="p-4 text-gray-700">{requester}</td>
                                        <td className="p-4 text-gray-600 text-sm">{entryDate}</td>
                                        <td className="p-4">
                                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                                {activeTaskName}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            {!summary && !isLoading && (
                                                <button
                                                    onClick={() => handleGenerateSummary(doc)}
                                                    className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-all text-sm font-semibold shadow-sm cursor-pointer"
                                                >
                                                    <FaRobot className="text-lg" />
                                                    Gerar resumo com IA
                                                </button>
                                            )}

                                            {isLoading && (
                                                <div className="flex items-center justify-center gap-3 w-full p-4 bg-indigo-50/50 rounded-lg border border-indigo-100">
                                                    <svg className="animate-spin h-5 w-5 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    <span className="text-sm font-medium text-indigo-700">Analisando documento...</span>
                                                </div>
                                            )}

                                            {summary && !isLoading && (
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex justify-between items-center px-1">
                                                        <span className="text-xs font-bold text-green-600 uppercase tracking-wider">Resumo gerado</span>
                                                        <button
                                                            onClick={() => handleGenerateSummary(doc)}
                                                            className="text-xs text-indigo-600 hover:text-indigo-800 underline cursor-pointer"
                                                        >
                                                            Gerar novamente
                                                        </button>
                                                    </div>
                                                    <textarea
                                                        value={summary}
                                                        onChange={(e) => handleSummaryChange(doc.Id, e.target.value)}
                                                        className="w-full h-32 p-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y bg-white"
                                                    />
                                                    <button
                                                        onClick={() => handleCopy(doc.Id, summary)}
                                                        className={`flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg transition-all text-sm font-semibold shadow-sm cursor-pointer ${isCopied ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
                                                    >
                                                        {isCopied ? <FaCheck /> : <FaCopy />}
                                                        {isCopied ? 'Resumo copiado' : 'Copiar resumo'}
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default VerificacaoTemporaria;
