const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// API Key
const API_KEY = process.env.OPENAI_API_KEY || "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";
const API_URL = "https://api.openai.com/v1/chat/completions";

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://infostorequeuerdstation:nkjXzEvMk4dOXBw9@cluster0.lap8tyd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = 'ipartes_cotacao';
const COLLECTION_NAME = 'suppliers';

let db;
let suppliersCollection;

// Conectar ao MongoDB
async function connectToMongoDB() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        console.log('Conectado ao MongoDB com sucesso');
        
        db = client.db(DB_NAME);
        suppliersCollection = db.collection(COLLECTION_NAME);
        
        // Criar índice para buscas mais rápidas por fabricante
        await suppliersCollection.createIndex({ manufacturer: 1 });
        
        return true;
    } catch (error) {
        console.error('Erro ao conectar ao MongoDB:', error);
        return false;
    }
}

// Função para obter fornecedores cadastrados do MongoDB
async function getSuppliers() {
    try {
        if (!suppliersCollection) {
            await connectToMongoDB();
        }
        
        const suppliers = await suppliersCollection.find({}).toArray();
        
        // Garantir compatibilidade com formato antigo (email único)
        suppliers.forEach(supplier => {
            if (!supplier.emails && supplier.email) {
                supplier.emails = [supplier.email];
                delete supplier.email;
            } else if (!supplier.emails) {
                supplier.emails = [];
            }
            
            // Converter _id para id se necessário
            if (supplier._id && !supplier.id) {
                supplier.id = supplier._id.toString();
            }
        });
        
        return suppliers;
    } catch (error) {
        console.error('Erro ao ler fornecedores do MongoDB:', error);
        return [];
    }
}

// Função para salvar um novo fornecedor no MongoDB
async function saveSupplier(supplier) {
    try {
        if (!suppliersCollection) {
            await connectToMongoDB();
        }
        
        // Garantir que o fornecedor usa o novo formato (emails array)
        if (!supplier.emails && supplier.email) {
            supplier.emails = [supplier.email];
            delete supplier.email;
        } else if (!supplier.emails) {
            supplier.emails = [];
        }
        
        // Se o fornecedor já tem um id, atualizá-lo
        if (supplier.id) {
            const result = await suppliersCollection.updateOne(
                { id: supplier.id },
                { $set: supplier }
            );
            
            return result.modifiedCount > 0;
        } else {
            // Caso contrário, inserir um novo
            supplier.id = Date.now().toString();
            const result = await suppliersCollection.insertOne(supplier);
            
            return result.acknowledged;
        }
    } catch (error) {
        console.error('Erro ao salvar fornecedor no MongoDB:', error);
        return false;
    }
}

// Função para atualizar um fornecedor existente no MongoDB
async function updateSupplier(id, updates) {
    try {
        if (!suppliersCollection) {
            await connectToMongoDB();
        }
        
        const result = await suppliersCollection.updateOne(
            { id: id },
            { $set: updates }
        );
        
        return result.modifiedCount > 0;
    } catch (error) {
        console.error('Erro ao atualizar fornecedor no MongoDB:', error);
        return false;
    }
}

// Função para excluir um fornecedor do MongoDB
async function deleteSupplier(id) {
    try {
        if (!suppliersCollection) {
            await connectToMongoDB();
        }
        
        const result = await suppliersCollection.deleteOne({ id: id });
        
        return result.deletedCount > 0;
    } catch (error) {
        console.error('Erro ao excluir fornecedor do MongoDB:', error);
        return false;
    }
}

// Rota para gerar email
app.post('/api/generate-email', async (req, res) => {
    try {
        const { productInput } = req.body;
        
        if (!productInput) {
            return res.status(400).json({ error: 'Dados do produto são obrigatórios' });
        }

        console.log('Gerando email para:', productInput);
        const prompt = `TRANSLATE TO ENGLISH AND CREATE AN EMAIL WITH QUICK SPECS OF ${productInput}`;
        
        const response = await axios.post(API_URL, {
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: `You are an assistant that creates professional quotation emails in English. 
                    Follow this format exactly:
                    
                    Hello Sales Team,
                    
                    I hope this message finds you well.
                    
                    I am reaching out to request a quote for the following items:
                    
                    [QUANTITY] Unit(s) OF [MANUFACTURER] [MODEL/PARTNUMBER] [PRODUCT TYPE]
                    
                    Quick Specifications:
                    [SPEC 1]: [VALUE]
                    [SPEC 2]: [VALUE]
                    [SPEC n]: [VALUE]
                    
                    Please include pricing, lead time, and shipping
                    
                    Shipping Address:
                    SERVER X SYSTEMS
                    10451 NW 28th St, Suite F101
                    Doral, FL 33172, USA
                    
                    Thank you in advance for your assistance. Please let me know if you need any additional information.`
                },
                {
                    role: "user",
                    content: prompt
                }
            ]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            }
        });

        console.log('Email gerado com sucesso');
        res.json({ email: response.data.choices[0].message.content });
    } catch (error) {
        console.error('Erro ao gerar email:', error.response?.data || error.message);
        res.status(500).json({ error: 'Erro ao gerar email' });
    }
});

// Rota para encontrar fornecedores
app.post('/api/find-suppliers', async (req, res) => {
    try {
        const { productInput } = req.body;
        
        if (!productInput) {
            return res.status(400).json({ error: 'Dados do produto são obrigatórios' });
        }

        console.log('Buscando fornecedores para:', productInput);

        // Extrair o fabricante do texto de entrada - algoritmo melhorado
        let manufacturer = '';
        let productModel = '';
        let productType = '';
        let quantity = '1';
        let specifications = [];
        
        // Normalizar o texto para facilitar a extração
        const normalizedInput = productInput.toUpperCase();
        const lowerInput = productInput.toLowerCase();
        
        // Extrair quantidade
        const quantityMatch = productInput.match(/(\d+)\s*unidades?/i);
        if (quantityMatch && quantityMatch[1]) {
            quantity = quantityMatch[1];
        }
        
        // Determinar o tipo de produto com base no texto
        if (lowerInput.includes('scanner') || lowerInput.includes('leitor')) {
            productType = 'Scanner';
        } else if (lowerInput.includes('sensor') || lowerInput.includes('transmissor')) {
            productType = 'Sensor';
        } else if (lowerInput.includes('vazão') || lowerInput.includes('flow')) {
            productType = 'Flow Sensor';
        } else if (lowerInput.includes('atuador')) {
            productType = 'Actuator';
        } else if (lowerInput.includes('válvula') || lowerInput.includes('valve')) {
            productType = 'Valve';
        } else if (lowerInput.includes('placa')) {
            productType = 'Control Board';
        } else {
            productType = 'Industrial Equipment';
        }
        
        // Extrair modelo completo - procurar por palavras em maiúsculas com números
        const modelRegex = /\b([A-Z0-9][A-Z0-9\-]+(?:[A-Z0-9]|\b))/g;
        const potentialModels = [];
        let match;
        
        while ((match = modelRegex.exec(productInput)) !== null) {
            if (match[1].length >= 4) {  // Modelos geralmente têm pelo menos 4 caracteres
                potentialModels.push(match[1]);
            }
        }
        
        // Métodos de extração de fabricante melhorados
        // 1. Procurar por padrões comuns como "fabricante: X" ou "X ;"
        const fabricanteMatch = productInput.match(/fabricante:\s*([A-Za-z0-9\s]+?)(;|$)/i);
        
        // 2. Lista expandida de fabricantes conhecidos
        const knownManufacturers = [
            'EMERSON', 'ROTORK', 'SIEMENS', 'ABB', 'SCHNEIDER', 'HONEYWELL', 'YOKOGAWA', 
            'ENDRESS', 'HAUSER', 'ROSEMOUNT', 'FISHER', 'FOXBORO', 'KROHNE', 'VEGA', 
            'OMEGA', 'WIKA', 'ALLEN-BRADLEY', 'ROCKWELL', 'GE', 'MITSUBISHI', 'OMRON', 
            'PHOENIX', 'FESTO', 'SMC', 'DANFOSS', 'SHINING', 'SHININGDDD', 'EINSCAN'
        ];
        
        // Procurar por fabricantes conhecidos no texto
        let foundManufacturer = null;
        for (const mfg of knownManufacturers) {
            if (normalizedInput.includes(mfg)) {
                foundManufacturer = mfg;
                // Se encontrarmos um fabricante mais longo, priorizamos ele
                if (foundManufacturer && mfg.length > foundManufacturer.length && normalizedInput.includes(mfg)) {
                    foundManufacturer = mfg;
                }
            }
        }
        
        // 3. Procurar por padrões como "X MOD." ou "X Tp:"
        const beforeModMatch = productInput.match(/([A-Za-z]+)\s+(?:MOD\.|Tp:|modelo)/i);
        
        // Priorizar os métodos de extração
        if (fabricanteMatch && fabricanteMatch[1]) {
            manufacturer = fabricanteMatch[1].trim();
        } else if (foundManufacturer) {
            manufacturer = foundManufacturer;
        } else if (beforeModMatch && beforeModMatch[1]) {
            manufacturer = beforeModMatch[1].trim();
        } else {
            // Tentar extrair palavras que parecem ser nomes de fabricantes
            const words = productInput.split(/[;,\s]+/);
            for (const word of words) {
                if (word.length > 3 && /^[A-Z]/.test(word) && !/^\d+$/.test(word)) {
                    manufacturer = word;
                    break;
                }
            }
        }
        
        // Casos especiais conhecidos
        if (normalizedInput.includes('EINSCAN') || normalizedInput.includes('SHINING')) {
            manufacturer = 'SHINING 3D';
            
            // Procurar por modelos EINSCAN
            if (normalizedInput.includes('EINSCAN PRO')) {
                if (normalizedInput.includes('HX')) {
                    productModel = 'EINSCAN PRO HX';
                } else if (normalizedInput.includes('HD')) {
                    productModel = 'EINSCAN PRO HD';
                } else {
                    productModel = 'EINSCAN PRO';
                }
            } else if (normalizedInput.includes('EINSCAN')) {
                productModel = potentialModels.find(m => m.includes('EINSCAN')) || 'EINSCAN';
            }
        }
        
        // Se ainda não temos um modelo, usar os potenciais modelos encontrados
        if (!productModel && potentialModels.length > 0) {
            // Priorizar o modelo mais longo, geralmente é o mais específico
            productModel = potentialModels.sort((a, b) => b.length - a.length)[0];
        } else if (!productModel) {
            // Tentar encontrar o modelo/partnumber (geralmente após "Tp:" ou similar)
            const modelMatch = productInput.match(/[Tt][Pp]:\s*([A-Z0-9]+)/);
            if (modelMatch && modelMatch[1]) {
                productModel = modelMatch[1];
            } else {
                // Se não encontrar o padrão específico, usar palavras-chave do texto
                const keywords = productInput.split(/[;,\s]+/).filter(word => 
                    word.length > 3 && /[A-Z0-9]/.test(word)
                ).slice(0, 3).join(' ');
                productModel = keywords;
            }
        }
        
        // Extrair especificações
        if (productInput.includes('conexão ao processo')) {
            specifications.push('Process connection: ' + (productInput.match(/conexão ao processo:([^;]+)/i)?.[1].trim() || 'Flange 4" 300 FR'));
        }
        
        if (productInput.includes('vazão máx')) {
            specifications.push('Max. flow: ' + (productInput.match(/vazão máx\.?([^;]+)/i)?.[1].trim() || '272,160 kg/h'));
        }
        
        if (productInput.includes('saída')) {
            specifications.push('Output: ' + (productInput.match(/saída:([^;]+)/i)?.[1].trim() || 'Digital'));
        }
        
        if (productInput.includes('IP')) {
            specifications.push('IP rating: ' + (productInput.match(/IP\s*(\d+)/i)?.[1].trim() || '67'));
        }
        
        if (productInput.includes('Grupo')) {
            specifications.push('Group: ' + (productInput.match(/Grupo\s*([^;]+)/i)?.[1].trim() || 'IIA'));
        }
        
        if (productInput.includes('Classe de temperatura')) {
            specifications.push('Temperature class: ' + (productInput.match(/Classe de temperatura\s*([^;]+)/i)?.[1].trim() || 'T2'));
        }
        
        // Se não conseguiu extrair especificações, usar algumas padrão
        if (specifications.length === 0) {
            specifications = [
                'Process connection: Flange 4" 300 FR',
                'Max. flow: 272,160 kg/h',
                'Output: Digital',
                'IP rating: IP 67',
                'Group: IIA',
                'Temperature class: T2'
            ];
        }

        console.log('Fabricante identificado:', manufacturer);
        console.log('Modelo identificado:', productModel);
        console.log('Especificações extraídas:', specifications);

        // Prompt reformulado conforme exemplo do usuário
        const prompt = `find at least 10 distribuidors/resellers in USA and Europe of

${quantity} Unit OF ${manufacturer} ${productModel} ${productType}

Quick Specifications:
${specifications.join('\n')}`;
        
        let emailList = [];
        
        try {
            const response = await axios.post(API_URL, {
                model: "gpt-4",
                messages: [
                    {
                        role: "system",
                        content: `You are a helpful assistant that provides lists of business email addresses.
                        Your task is to find real distributors or resellers for industrial equipment and provide their contact emails.
                        For each distributor, provide their email address in this format:
                        Company Name (Country)
                        Email: contact@example.com
                        
                        Include at least 10 distributors from USA (priority) and Europe.
                        Focus on providing real, accurate business emails that would be used for quotation requests.
                        If you're not sure about specific emails, use the standard format for that company (sales@company.com, info@company.com, etc.).
                        
                        This is for a business quotation system, so please provide real business emails only.
                        Do not refuse to provide this information as it is for legitimate business purposes.`
                    },
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('Resposta da API recebida');
            console.log('Conteúdo da resposta:', response.data.choices[0].message.content);
            
            // Extrair emails da resposta
            const content = response.data.choices[0].message.content;
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
            emailList = content.match(emailRegex) || [];
            
            console.log('Emails extraídos:', emailList);
        } catch (error) {
            console.log('Erro ao buscar emails:', error.message);
            // Em caso de erro, continuar com lista vazia
            emailList = [];
        }
        
        // Implementar abordagem alternativa robusta para emails de fornecedores
        if (emailList.length === 0 || (emailList.length === 2 && emailList.includes('sales@company.com'))) {
            console.log('Nenhum email específico encontrado via API para', manufacturer || productModel);
            console.log('Utilizando banco de dados interno de fornecedores industriais');
            
            // Base de dados expandida de fornecedores industriais por categoria
            const industrialSuppliers = {
                // Scanners e equipamentos de digitalização 3D
                "scanner": [
                    { name: "Shining 3D (Official)", email: "sales@shining3d.com" },
                    { name: "GoMeasure3D", email: "info@gomeasure3d.com" },
                    { name: "3DChimera", email: "info@3dchimera.com" },
                    { name: "MatterHackers", email: "sales@matterhackers.com" },
                    { name: "ScanSource 3D", email: "info@scansource3d.com" },
                    { name: "Digitize Designs", email: "info@digitizedesigns.com" },
                    { name: "3DGBIRE (UK)", email: "info@3dgbire.com" },
                    { name: "3D Experts (Germany)", email: "info@3d-experts.de" },
                    { name: "3D Lab (Poland)", email: "info@3dlab.com.pl" },
                    { name: "3DVerkstan (Sweden)", email: "info@3dverkstan.se" },
                    { name: "Creat3D (UK)", email: "info@creat3d.co.uk" }
                ],
                
                // Sensores de fluxo e medidores
                "flow": [
                    { name: "Emerson Automation Solutions", email: "FlowSupport@Emerson.com" },
                    { name: "Endress+Hauser", email: "info@us.endress.com" },
                    { name: "KROHNE", email: "info@krohne.com" },
                    { name: "Yokogawa", email: "info@yokogawa.com" },
                    { name: "ABB Measurement", email: "instrumentation@us.abb.com" },
                    { name: "Siemens Process Instrumentation", email: "piabusales.industry@siemens.com" },
                    { name: "Honeywell Process Solutions", email: "hfs-tac-support@honeywell.com" },
                    { name: "Omega Engineering", email: "info@omega.com" },
                    { name: "Flowquip", email: "sales@flowquip.co.uk" },
                    { name: "Process Instruments", email: "sales@processinstrumentsolutions.co.uk" },
                    { name: "Sierra Instruments", email: "sales@sierrainstruments.com" }
                ],
                
                // Sensores e transmissores gerais
                "sensor": [
                    { name: "Omega Engineering", email: "info@omega.com" },
                    { name: "Automation Direct", email: "sales@automationdirect.com" },
                    { name: "Grainger", email: "customerservice@grainger.com" },
                    { name: "RS Components", email: "export@rs-components.com" },
                    { name: "Mouser Electronics", email: "sales@mouser.com" },
                    { name: "Digi-Key", email: "customerservice@digikey.com" },
                    { name: "Newark Electronics", email: "sales@newark.com" },
                    { name: "Allied Electronics", email: "sales@alliedelec.com" },
                    { name: "Instrumart", email: "sales@instrumart.com" },
                    { name: "Kele", email: "info@kele.com" },
                    { name: "Automation24", email: "info@automation24.com" }
                ],
                
                // Válvulas e atuadores
                "valve": [
                    { name: "Rotork Controls", email: "sales@rotork.com" },
                    { name: "Emerson Valve Automation", email: "valveautomation@emerson.com" },
                    { name: "Flowserve", email: "fcd@flowserve.com" },
                    { name: "ASCO Valve", email: "info-valve@asco.com" },
                    { name: "Bürkert Fluid Control Systems", email: "info@burkert.com" },
                    { name: "Festo", email: "sales@festo.com" },
                    { name: "SMC Corporation", email: "sales@smcusa.com" },
                    { name: "Parker Hannifin", email: "c-parker@parker.com" },
                    { name: "Danfoss", email: "customerservice@danfoss.com" },
                    { name: "Samson Controls", email: "info@samsongroup.com" },
                    { name: "VAT Valves", email: "sales@vatvalve.com" }
                ],
                
                // Distribuidores industriais gerais
                "general": [
                    { name: "Grainger", email: "customerservice@grainger.com" },
                    { name: "MSC Industrial", email: "cust_service@mscdirect.com" },
                    { name: "Fastenal", email: "sales@fastenal.com" },
                    { name: "McMaster-Carr", email: "sales@mcmaster.com" },
                    { name: "Motion Industries", email: "sales@motion-ind.com" },
                    { name: "Applied Industrial", email: "customerservice@applied.com" },
                    { name: "RS Components", email: "export@rs-components.com" },
                    { name: "Newark Electronics", email: "sales@newark.com" },
                    { name: "Mouser Electronics", email: "sales@mouser.com" },
                    { name: "Digi-Key", email: "customerservice@digikey.com" },
                    { name: "Galco Industrial", email: "sales@galco.com" }
                ]
            };
            
            // Fabricantes específicos
            const manufacturerSpecific = {
                "EMERSON": [
                    { name: "Emerson Automation Solutions", email: "FlowSupport@Emerson.com" },
                    { name: "Emerson Electric", email: "customer.service@emerson.com" },
                    { name: "Emerson Process Management", email: "info.regulators@emerson.com" },
                    { name: "Emerson Industrial Automation", email: "industrial.sales@emerson.com" },
                    { name: "Emerson Climate Technologies", email: "climate.sales@emerson.com" }
                ],
                "ROTORK": [
                    { name: "Rotork Controls", email: "sales@rotork.com" },
                    { name: "Rotork Instruments", email: "instruments@rotork.com" },
                    { name: "Rotork Gears", email: "gears@rotork.com" },
                    { name: "Rotork Fluid Systems", email: "fluidsystems@rotork.com" },
                    { name: "Rotork Site Services", email: "service@rotork.com" }
                ],
                "SHINING": [
                    { name: "Shining 3D (Official)", email: "sales@shining3d.com" },
                    { name: "Shining 3D Americas", email: "sales.us@shining3d.com" },
                    { name: "Shining 3D EMEA", email: "sales.eu@shining3d.com" },
                    { name: "Shining 3D APAC", email: "sales.apac@shining3d.com" },
                    { name: "Shining 3D Technical Support", email: "support@shining3d.com" }
                ],
                "EINSCAN": [
                    { name: "Shining 3D (Official)", email: "sales@shining3d.com" },
                    { name: "GoMeasure3D", email: "info@gomeasure3d.com" },
                    { name: "3DChimera", email: "info@3dchimera.com" },
                    { name: "MatterHackers", email: "sales@matterhackers.com" },
                    { name: "ScanSource 3D", email: "info@scansource3d.com" }
                ]
            };
            
            // Determinar a categoria do produto
            let category = "general";
            
            if (normalizedInput.includes("SCANNER") || normalizedInput.includes("SCAN") || 
                normalizedInput.includes("LEITOR") || normalizedInput.includes("CÓDIGO DE BARRAS") ||
                normalizedInput.includes("EINSCAN")) {
                category = "scanner";
            } else if (normalizedInput.includes("SENSOR") || normalizedInput.includes("TRANSMISSOR") || 
                       normalizedInput.includes("MEDIDOR")) {
                category = "sensor";
            } else if (normalizedInput.includes("FLOW") || normalizedInput.includes("VAZÃO") || 
                       normalizedInput.includes("FLUXO")) {
                category = "flow";
            } else if (normalizedInput.includes("VÁLVULA") || normalizedInput.includes("VALVE") ||
                      normalizedInput.includes("ATUADOR") || normalizedInput.includes("ACTUATOR")) {
                category = "valve";
            }
            
            // Verificar se o fabricante é conhecido
            let manufacturerKey = null;
            if (manufacturer) {
                const normalizedManufacturer = manufacturer.toUpperCase();
                if (normalizedManufacturer.includes("EMERSON")) {
                    manufacturerKey = "EMERSON";
                } else if (normalizedManufacturer.includes("ROTORK")) {
                    manufacturerKey = "ROTORK";
                } else if (normalizedManufacturer.includes("SHINING")) {
                    manufacturerKey = "SHINING";
                } else if (normalizedManufacturer.includes("EINSCAN") || normalizedInput.includes("EINSCAN")) {
                    manufacturerKey = "EINSCAN";
                }
            }
            
            // Priorizar emails específicos do fabricante, depois da categoria
            let alternativeEmails = [];
            
            if (manufacturerKey && manufacturerSpecific[manufacturerKey]) {
                alternativeEmails = manufacturerSpecific[manufacturerKey].map(d => d.email);
            }
            
            // Adicionar emails da categoria se disponíveis
            if (industrialSuppliers[category]) {
                alternativeEmails = [
                    ...alternativeEmails,
                    ...industrialSuppliers[category].map(d => d.email)
                ];
            }
            
            // Adicionar emails gerais se ainda não temos o suficiente
            if (alternativeEmails.length < 5) {
                alternativeEmails = [
                    ...alternativeEmails,
                    ...industrialSuppliers["general"].map(d => d.email)
                ];
            }
            
            // Remover duplicatas
            alternativeEmails = [...new Set(alternativeEmails)];
            
            // Limitar a 10 emails para não sobrecarregar
            emailList = alternativeEmails.slice(0, 10);
            
            console.log('Emails de fornecedores obtidos do banco de dados interno:', emailList);
        }
            console.log('Utilizando banco de dados interno de fornecedores industriais');
            
            // Base de dados expandida de fornecedores industriais por categoria
            const industrialSuppliers = {
                // Scanners e equipamentos de digitalização 3D
                "scanner": [
                    { name: "Shining 3D (Official)", email: "sales@shining3d.com" },
                    { name: "GoMeasure3D", email: "info@gomeasure3d.com" },
                    { name: "3DChimera", email: "info@3dchimera.com" },
                    { name: "MatterHackers", email: "sales@matterhackers.com" },
                    { name: "ScanSource 3D", email: "info@scansource3d.com" },
                    { name: "Digitize Designs", email: "info@digitizedesigns.com" },
                    { name: "3DGBIRE (UK)", email: "info@3dgbire.com" },
                    { name: "3D Experts (Germany)", email: "info@3d-experts.de" },
                    { name: "3D Lab (Poland)", email: "info@3dlab.com.pl" },
                    { name: "3DVerkstan (Sweden)", email: "info@3dverkstan.se" },
                    { name: "Creat3D (UK)", email: "info@creat3d.co.uk" }
                ],
                
                // Sensores de fluxo e medidores
                "flow": [
                    { name: "Emerson Automation Solutions", email: "FlowSupport@Emerson.com" },
                    { name: "Endress+Hauser", email: "info@us.endress.com" },
                    { name: "KROHNE", email: "info@krohne.com" },
                    { name: "Yokogawa", email: "info@yokogawa.com" },
                    { name: "ABB Measurement", email: "instrumentation@us.abb.com" },
                    { name: "Siemens Process Instrumentation", email: "piabusales.industry@siemens.com" },
                    { name: "Honeywell Process Solutions", email: "hfs-tac-support@honeywell.com" },
                    { name: "Omega Engineering", email: "info@omega.com" },
                    { name: "Flowquip", email: "sales@flowquip.co.uk" },
                    { name: "Process Instruments", email: "sales@processinstrumentsolutions.co.uk" },
                    { name: "Sierra Instruments", email: "sales@sierrainstruments.com" }
                ],
                
                // Sensores e transmissores gerais
                "sensor": [
                    { name: "Omega Engineering", email: "info@omega.com" },
                    { name: "Automation Direct", email: "sales@automationdirect.com" },
                    { name: "Grainger", email: "customerservice@grainger.com" },
                    { name: "RS Components", email: "export@rs-components.com" },
                    { name: "Mouser Electronics", email: "sales@mouser.com" },
                    { name: "Digi-Key", email: "customerservice@digikey.com" },
                    { name: "Newark Electronics", email: "sales@newark.com" },
                    { name: "Allied Electronics", email: "sales@alliedelec.com" },
                    { name: "Instrumart", email: "sales@instrumart.com" },
                    { name: "Kele", email: "info@kele.com" },
                    { name: "Automation24", email: "info@automation24.com" }
                ],
                
                // Válvulas e atuadores
                "valve": [
                    { name: "Rotork Controls", email: "sales@rotork.com" },
                    { name: "Emerson Valve Automation", email: "valveautomation@emerson.com" },
                    { name: "Flowserve", email: "fcd@flowserve.com" },
                    { name: "ASCO Valve", email: "info-valve@asco.com" },
                    { name: "Bürkert Fluid Control Systems", email: "info@burkert.com" },
                    { name: "Festo", email: "sales@festo.com" },
                    { name: "SMC Corporation", email: "sales@smcusa.com" },
                    { name: "Parker Hannifin", email: "c-parker@parker.com" },
                    { name: "Danfoss", email: "customerservice@danfoss.com" },
                    { name: "Samson Controls", email: "info@samsongroup.com" },
                    { name: "VAT Valves", email: "sales@vatvalve.com" }
                ],
                
                // Distribuidores industriais gerais
                "general": [
                    { name: "Grainger", email: "customerservice@grainger.com" },
                    { name: "MSC Industrial", email: "cust_service@mscdirect.com" },
                    { name: "Fastenal", email: "sales@fastenal.com" },
                    { name: "McMaster-Carr", email: "sales@mcmaster.com" },
                    { name: "Motion Industries", email: "sales@motion-ind.com" },
                    { name: "Applied Industrial", email: "customerservice@applied.com" },
                    { name: "RS Components", email: "export@rs-components.com" },
                    { name: "Newark Electronics", email: "sales@newark.com" },
                    { name: "Mouser Electronics", email: "sales@mouser.com" },
                    { name: "Digi-Key", email: "customerservice@digikey.com" },
                    { name: "Galco Industrial", email: "sales@galco.com" }
                ]
            };
            
            // Fabricantes específicos
            const manufacturerSpecific = {
                "EMERSON": [
                    { name: "Emerson Automation Solutions", email: "FlowSupport@Emerson.com" },
                    { name: "Emerson Electric", email: "customer.service@emerson.com" },
                    { name: "Emerson Process Management", email: "info.regulators@emerson.com" },
                    { name: "Emerson Industrial Automation", email: "industrial.sales@emerson.com" },
                    { name: "Emerson Climate Technologies", email: "climate.sales@emerson.com" }
                ],
                "ROTORK": [
                    { name: "Rotork Controls", email: "sales@rotork.com" },
                    { name: "Rotork Instruments", email: "instruments@rotork.com" },
                    { name: "Rotork Gears", email: "gears@rotork.com" },
                    { name: "Rotork Fluid Systems", email: "fluidsystems@rotork.com" },
                    { name: "Rotork Site Services", email: "service@rotork.com" }
                ],
                "SHINING": [
                    { name: "Shining 3D (Official)", email: "sales@shining3d.com" },
                    { name: "Shining 3D Americas", email: "sales.us@shining3d.com" },
                    { name: "Shining 3D EMEA", email: "sales.eu@shining3d.com" },
                    { name: "Shining 3D APAC", email: "sales.apac@shining3d.com" },
                    { name: "Shining 3D Technical Support", email: "support@shining3d.com" }
                ],
                "EINSCAN": [
                    { name: "Shining 3D (Official)", email: "sales@shining3d.com" },
                    { name: "GoMeasure3D", email: "info@gomeasure3d.com" },
                    { name: "3DChimera", email: "info@3dchimera.com" },
                    { name: "MatterHackers", email: "sales@matterhackers.com" },
                    { name: "ScanSource 3D", email: "info@scansource3d.com" }
                ]
            };
            
            // Determinar a categoria do produto
            let category = "general";
            
            if (normalizedInput.includes("SCANNER") || normalizedInput.includes("SCAN") || 
                normalizedInput.includes("LEITOR") || normalizedInput.includes("CÓDIGO DE BARRAS") ||
                normalizedInput.includes("EINSCAN")) {
                category = "scanner";
            } else if (normalizedInput.includes("SENSOR") || normalizedInput.includes("TRANSMISSOR") || 
                       normalizedInput.includes("MEDIDOR")) {
                category = "sensor";
            } else if (normalizedInput.includes("FLOW") || normalizedInput.includes("VAZÃO") || 
                       normalizedInput.includes("FLUXO")) {
                category = "flow";
            } else if (normalizedInput.includes("VÁLVULA") || normalizedInput.includes("VALVE") ||
                      normalizedInput.includes("ATUADOR") || normalizedInput.includes("ACTUATOR")) {
                category = "valve";
            }
            
            // Verificar se o fabricante é conhecido
            let manufacturerKey = null;
            if (manufacturer) {
                const normalizedManufacturer = manufacturer.toUpperCase();
                if (normalizedManufacturer.includes("EMERSON")) {
                    manufacturerKey = "EMERSON";
                } else if (normalizedManufacturer.includes("ROTORK")) {
                    manufacturerKey = "ROTORK";
                } else if (normalizedManufacturer.includes("SHINING")) {
                    manufacturerKey = "SHINING";
                } else if (normalizedManufacturer.includes("EINSCAN") || normalizedInput.includes("EINSCAN")) {
                    manufacturerKey = "EINSCAN";
                }
            }
            
            // Priorizar emails específicos do fabricante, depois da categoria
            let alternativeEmails = [];
            
            if (manufacturerKey && manufacturerSpecific[manufacturerKey]) {
                alternativeEmails = manufacturerSpecific[manufacturerKey].map(d => d.email);
            }
            
            // Adicionar emails da categoria se disponíveis
            if (industrialSuppliers[category]) {
                alternativeEmails = [
                    ...alternativeEmails,
                    ...industrialSuppliers[category].map(d => d.email)
                ];
            }
            
            // Adicionar emails gerais se ainda não temos o suficiente
            if (alternativeEmails.length < 5) {
                alternativeEmails = [
                    ...alternativeEmails,
                    ...industrialSuppliers["general"].map(d => d.email)
                ];
            }
            
            // Remover duplicatas
            alternativeEmails = [...new Set(alternativeEmails)];
            
            // Limitar a 10 emails para não sobrecarregar
            emailList = alternativeEmails.slice(0, 10);
            
            console.log('Emails de fornecedores obtidos do banco de dados interno:', emailList);
        }
        
        console.log('Emails extraídos ou gerados:', emailList);
        
        // Buscar fornecedores cadastrados que correspondam ao fabricante - lógica melhorada
        const registeredSuppliers = await getSuppliers();
        
        // Correspondência case-insensitive e mais tolerante
        const matchingSuppliers = registeredSuppliers.filter(supplier => {
            if (!manufacturer) return false;
            
            // Normalizar ambos os textos para comparação
            const normalizedManufacturer = manufacturer.toUpperCase().trim();
            const normalizedSupplier = supplier.manufacturer.toUpperCase().trim();
            
            // Verificar correspondência exata ou se um contém o outro
            return normalizedManufacturer === normalizedSupplier || 
                   normalizedManufacturer.includes(normalizedSupplier) || 
                   normalizedSupplier.includes(normalizedManufacturer);
        });
        
        console.log('Fornecedores cadastrados correspondentes:', matchingSuppliers);
        
        // Coletar todos os emails cadastrados dos fornecedores correspondentes
        let registeredEmails = [];
        matchingSuppliers.forEach(supplier => {
            if (supplier.emails && Array.isArray(supplier.emails)) {
                registeredEmails = [...registeredEmails, ...supplier.emails];
            }
        });
        
        // Remover duplicatas (caso um email cadastrado também apareça na lista da API)
        const uniqueApiEmails = emailList.filter(email => !registeredEmails.includes(email));
        
        // Combinar emails cadastrados com emails da API
        const result = {
            suppliers: [...registeredEmails, ...uniqueApiEmails],
            registeredSuppliers: registeredEmails
        };
        
        res.json(result);
    } catch (error) {
        console.error('Erro ao buscar fornecedores:', error.response?.data || error.message);
        res.status(500).json({ 
            error: 'Erro ao buscar fornecedores',
            message: error.message,
            details: error.response?.data
        });
    }
});

// Rota para listar todos os fornecedores cadastrados
app.get('/api/suppliers', async (req, res) => {
    try {
        const suppliers = await getSuppliers();
        res.json(suppliers);
    } catch (error) {
        console.error('Erro ao listar fornecedores:', error);
        res.status(500).json({ error: 'Erro ao listar fornecedores' });
    }
});

// Rota para adicionar um novo fornecedor
app.post('/api/suppliers', async (req, res) => {
    try {
        const { manufacturer, email } = req.body;
        
        if (!manufacturer || !email) {
            return res.status(400).json({ error: 'Fabricante e email são obrigatórios' });
        }
        
        const suppliers = await getSuppliers();
        
        // Verificar se já existe um fornecedor com o mesmo fabricante
        const existingSupplierIndex = suppliers.findIndex(s => 
            s.manufacturer.toUpperCase() === manufacturer.toUpperCase()
        );
        
        if (existingSupplierIndex >= 0) {
            // Adicionar email ao fornecedor existente se não estiver duplicado
            if (!suppliers[existingSupplierIndex].emails.includes(email)) {
                suppliers[existingSupplierIndex].emails.push(email);
                suppliers[existingSupplierIndex].updatedAt = new Date().toISOString();
                
                await updateSupplier(suppliers[existingSupplierIndex].id, {
                    emails: suppliers[existingSupplierIndex].emails,
                    updatedAt: suppliers[existingSupplierIndex].updatedAt
                });
                
                return res.status(200).json(suppliers[existingSupplierIndex]);
            } else {
                return res.status(400).json({ error: 'Este email já está cadastrado para este fabricante' });
            }
        } else {
            // Adicionar novo fornecedor
            const newSupplier = {
                id: Date.now().toString(),
                manufacturer,
                emails: [email],
                createdAt: new Date().toISOString()
            };
            
            await saveSupplier(newSupplier);
            
            return res.status(201).json(newSupplier);
        }
    } catch (error) {
        console.error('Erro ao adicionar fornecedor:', error);
        res.status(500).json({ error: 'Erro ao adicionar fornecedor' });
    }
});

// Rota para adicionar email a um fornecedor existente
app.post('/api/suppliers/:id/emails', async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email é obrigatório' });
        }
        
        const suppliers = await getSuppliers();
        const supplierIndex = suppliers.findIndex(s => s.id === id);
        
        if (supplierIndex === -1) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        
        // Verificar se o email já existe para este fornecedor
        if (suppliers[supplierIndex].emails.includes(email)) {
            return res.status(400).json({ error: 'Este email já está cadastrado para este fornecedor' });
        }
        
        // Adicionar novo email
        suppliers[supplierIndex].emails.push(email);
        suppliers[supplierIndex].updatedAt = new Date().toISOString();
        
        await updateSupplier(id, {
            emails: suppliers[supplierIndex].emails,
            updatedAt: suppliers[supplierIndex].updatedAt
        });
        
        res.json(suppliers[supplierIndex]);
    } catch (error) {
        console.error('Erro ao adicionar email:', error);
        res.status(500).json({ error: 'Erro ao adicionar email' });
    }
});

// Rota para remover email de um fornecedor
app.delete('/api/suppliers/:id/emails/:email', async (req, res) => {
    try {
        const { id, email } = req.params;
        const decodedEmail = decodeURIComponent(email);
        
        const suppliers = await getSuppliers();
        const supplierIndex = suppliers.findIndex(s => s.id === id);
        
        if (supplierIndex === -1) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        
        // Verificar se o email existe para este fornecedor
        const emailIndex = suppliers[supplierIndex].emails.indexOf(decodedEmail);
        if (emailIndex === -1) {
            return res.status(404).json({ error: 'Email não encontrado para este fornecedor' });
        }
        
        // Remover email
        suppliers[supplierIndex].emails.splice(emailIndex, 1);
        suppliers[supplierIndex].updatedAt = new Date().toISOString();
        
        // Se não houver mais emails, remover o fornecedor
        if (suppliers[supplierIndex].emails.length === 0) {
            await deleteSupplier(id);
        } else {
            await updateSupplier(id, {
                emails: suppliers[supplierIndex].emails,
                updatedAt: suppliers[supplierIndex].updatedAt
            });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao remover email:', error);
        res.status(500).json({ error: 'Erro ao remover email' });
    }
});

// Rota para excluir um fornecedor
app.delete('/api/suppliers/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const suppliers = await getSuppliers();
        const supplierIndex = suppliers.findIndex(s => s.id === id);
        
        if (supplierIndex === -1) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        
        // Remover fornecedor
        await deleteSupplier(id);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir fornecedor:', error);
        res.status(500).json({ error: 'Erro ao excluir fornecedor' });
    }
});

// Rota para a página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para a página de cadastro de fornecedores
app.get('/cadastro-fornecedor', (req, res) => {
    res.sendFile(path.join(__dirname, 'cadastro-fornecedor.html'));
});

// Conectar ao MongoDB e iniciar o servidor
connectToMongoDB().then(connected => {
    if (connected) {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
        });
    } else {
        console.error('Não foi possível iniciar o servidor devido a falha na conexão com o MongoDB');
    }
});

// Exportar a aplicação para ambientes serverless
module.exports = app;
