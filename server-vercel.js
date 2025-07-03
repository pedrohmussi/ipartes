const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// API Key - Usando variável de ambiente
const API_KEY = process.env.OPENAI_API_KEY || "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";
const API_URL = "https://api.openai.com/v1/chat/completions";

// Armazenamento em memória para fornecedores cadastrados (substitui o sistema de arquivos)
let suppliersData = [
  {
    "id": "1621518400000",
    "manufacturer": "EMERSON",
    "emails": [
      "sales@emerson.com"
    ],
    "createdAt": "2025-05-20T13:06:40.000Z",
    "updatedAt": "2025-05-20T14:52:41.294Z"
  },
  {
    "id": "1621518500000",
    "manufacturer": "ROTORK",
    "emails": [
      "sales@rotork.com"
    ],
    "createdAt": "2025-05-20T13:06:50.000Z"
  }
];

// Função para obter fornecedores cadastrados (versão em memória)
function getSuppliers() {
  return suppliersData;
}

// Função para salvar fornecedores cadastrados (versão em memória)
function saveSuppliers(suppliers) {
  suppliersData = suppliers;
  return true;
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
                        If you're not sure about specific emails, use the standard format for that company (sales@company.com, info@company.com, etc.).`
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

            console.log('Resposta da API recebida');
            
            // Processar a resposta para extrair apenas os emails
            const content = response.data.choices[0].message.content;
            console.log('Conteúdo da resposta:', content);
            
            // Extrair emails da resposta usando regex
            const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
            const extractedEmails = content.match(emailRegex) || [];
            
            // Filtrar e limpar a lista de emails
            emailList = [...new Set(extractedEmails)].map(email => email.trim());
            
            console.log('Emails extraídos:', emailList);
            
        } catch (error) {
            console.error('Erro ao obter emails da API:', error.message);
            // Em caso de erro, continuar com lista vazia
            emailList = [];
        }
        
        // Implementar abordagens alternativas para obter emails reais
        if (emailList.length === 0) {
            console.log('Nenhum email encontrado via API para', manufacturer || productModel);
            console.log('Utilizando abordagem alternativa para obter emails reais');
            
            // Abordagem 1: Emails de distribuidores industriais conhecidos
            const knownDistributors = [
                { name: "Grainger", email: "customerservice@grainger.com" },
                { name: "MSC Industrial", email: "cust_service@mscdirect.com" },
                { name: "Fastenal", email: "sales@fastenal.com" },
                { name: "McMaster-Carr", email: "sales@mcmaster.com" },
                { name: "Motion Industries", email: "sales@motion-ind.com" },
                { name: "Applied Industrial", email: "customerservice@applied.com" },
                { name: "RS Components", email: "sales.us@rs-components.com" },
                { name: "Newark Electronics", email: "sales@newark.com" },
                { name: "Mouser Electronics", email: "sales@mouser.com" },
                { name: "Digi-Key", email: "customerservice@digikey.com" },
                { name: "Omega Engineering", email: "info@omega.com" },
                { name: "Automation Direct", email: "sales@automationdirect.com" },
                { name: "Galco Industrial", email: "sales@galco.com" },
                { name: "Allied Electronics", email: "sales@alliedelec.com" },
                { name: "Radwell International", email: "info@radwell.com" }
            ];
            
            // Abordagem 2: Emails específicos por indústria
            const industrySpecificDistributors = {
                "scanner": [
                    { name: "ScanSource", email: "sales@scansource.com" },
                    { name: "BlueStar", email: "sales@bluestarinc.com" },
                    { name: "Ingram Micro", email: "sales@ingrammicro.com" },
                    { name: "CDW", email: "sales@cdw.com" },
                    { name: "Barcodes Inc", email: "info@barcodesinc.com" }
                ],
                "sensor": [
                    { name: "Automation24", email: "info@automation24.com" },
                    { name: "AutomationDirect", email: "sales@automationdirect.com" },
                    { name: "Kele", email: "info@kele.com" },
                    { name: "Instrumart", email: "sales@instrumart.com" },
                    { name: "Omega Engineering", email: "info@omega.com" }
                ],
                "flow": [
                    { name: "Cole-Parmer", email: "sales@coleparmer.com" },
                    { name: "Instrumart", email: "sales@instrumart.com" },
                    { name: "Omega Engineering", email: "info@omega.com" },
                    { name: "Grainger", email: "customerservice@grainger.com" },
                    { name: "Process Instruments", email: "sales@process-instruments-inc.com" }
                ],
                "emerson": [
                    { name: "Emerson Automation Solutions", email: "FlowSupport@Emerson.com" },
                    { name: "Emerson Electric", email: "customer.service@emerson.com" },
                    { name: "Emerson Process Management", email: "info.regulators@emerson.com" },
                    { name: "Emerson Industrial Automation", email: "industrial.sales@emerson.com" },
                    { name: "Emerson Climate Technologies", email: "climate.sales@emerson.com" }
                ],
                "rotork": [
                    { name: "Rotork Controls", email: "sales@rotork.com" },
                    { name: "Rotork Instruments", email: "instruments@rotork.com" },
                    { name: "Rotork Gears", email: "gears@rotork.com" },
                    { name: "Rotork Fluid Systems", email: "fluidsystems@rotork.com" },
                    { name: "Rotork Site Services", email: "service@rotork.com" }
                ]
            };
            
            // Determinar a categoria do produto
            let category = "general";
            const normalizedInput = productInput.toLowerCase();
            
            if (normalizedInput.includes("scanner") || normalizedInput.includes("scan") || 
                normalizedInput.includes("leitor") || normalizedInput.includes("código de barras")) {
                category = "scanner";
            } else if (normalizedInput.includes("sensor") || normalizedInput.includes("transmissor") || 
                       normalizedInput.includes("medidor")) {
                category = "sensor";
            } else if (normalizedInput.includes("flow") || normalizedInput.includes("vazão") || 
                       normalizedInput.includes("fluxo")) {
                category = "flow";
            }
            
            // Verificar se o fabricante é conhecido
            if (manufacturer && manufacturer.toLowerCase().includes("emerson")) {
                category = "emerson";
            } else if (manufacturer && manufacturer.toLowerCase().includes("rotork")) {
                category = "rotork";
            }
            
            // Combinar emails de distribuidores gerais e específicos da indústria
            let alternativeEmails = [...knownDistributors.map(d => d.email)];
            
            // Adicionar emails específicos da categoria se disponíveis
            if (industrySpecificDistributors[category]) {
                alternativeEmails = [
                    ...industrySpecificDistributors[category].map(d => d.email),
                    ...alternativeEmails
                ];
            }
            
            // Limitar a 10 emails para não sobrecarregar
            emailList = alternativeEmails.slice(0, 10);
            
            console.log('Emails alternativos obtidos:', emailList);
        }
        
        console.log('Emails extraídos ou gerados:', emailList);
        
        // Buscar fornecedores cadastrados que correspondam ao fabricante - lógica melhorada
        const registeredSuppliers = getSuppliers();
        
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
app.get('/api/suppliers', (req, res) => {
    try {
        const suppliers = getSuppliers();
        res.json(suppliers);
    } catch (error) {
        console.error('Erro ao listar fornecedores:', error);
        res.status(500).json({ error: 'Erro ao listar fornecedores' });
    }
});

// Rota para adicionar um novo fornecedor
app.post('/api/suppliers', (req, res) => {
    try {
        const { manufacturer, email } = req.body;
        
        if (!manufacturer || !email) {
            return res.status(400).json({ error: 'Fabricante e email são obrigatórios' });
        }
        
        const suppliers = getSuppliers();
        
        // Verificar se já existe um fornecedor com o mesmo fabricante
        const existingSupplierIndex = suppliers.findIndex(s => 
            s.manufacturer.toUpperCase() === manufacturer.toUpperCase()
        );
        
        if (existingSupplierIndex >= 0) {
            // Adicionar email ao fornecedor existente se não estiver duplicado
            if (!suppliers[existingSupplierIndex].emails.includes(email)) {
                suppliers[existingSupplierIndex].emails.push(email);
                suppliers[existingSupplierIndex].updatedAt = new Date().toISOString();
                saveSuppliers(suppliers);
            }
            
            res.json(suppliers[existingSupplierIndex]);
        } else {
            // Criar novo fornecedor
            const newSupplier = {
                id: Date.now().toString(),
                manufacturer,
                emails: [email],
                createdAt: new Date().toISOString()
            };
            
            suppliers.push(newSupplier);
            saveSuppliers(suppliers);
            
            res.json(newSupplier);
        }
    } catch (error) {
        console.error('Erro ao adicionar fornecedor:', error);
        res.status(500).json({ error: 'Erro ao adicionar fornecedor' });
    }
});

// Rota para excluir um email de um fornecedor
app.delete('/api/suppliers/:id/emails/:email', (req, res) => {
    try {
        const { id, email } = req.params;
        
        if (!id || !email) {
            return res.status(400).json({ error: 'ID do fornecedor e email são obrigatórios' });
        }
        
        const suppliers = getSuppliers();
        const supplierIndex = suppliers.findIndex(s => s.id === id);
        
        if (supplierIndex < 0) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        
        const emailIndex = suppliers[supplierIndex].emails.indexOf(email);
        
        if (emailIndex < 0) {
            return res.status(404).json({ error: 'Email não encontrado' });
        }
        
        // Remover o email
        suppliers[supplierIndex].emails.splice(emailIndex, 1);
        suppliers[supplierIndex].updatedAt = new Date().toISOString();
        
        // Se não houver mais emails, remover o fornecedor
        if (suppliers[supplierIndex].emails.length === 0) {
            suppliers.splice(supplierIndex, 1);
        }
        
        saveSuppliers(suppliers);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir email:', error);
        res.status(500).json({ error: 'Erro ao excluir email' });
    }
});

// Rota para excluir um fornecedor
app.delete('/api/suppliers/:id', (req, res) => {
    try {
        const { id } = req.params;
        
        if (!id) {
            return res.status(400).json({ error: 'ID do fornecedor é obrigatório' });
        }
        
        const suppliers = getSuppliers();
        const supplierIndex = suppliers.findIndex(s => s.id === id);
        
        if (supplierIndex < 0) {
            return res.status(404).json({ error: 'Fornecedor não encontrado' });
        }
        
        // Remover o fornecedor
        suppliers.splice(supplierIndex, 1);
        saveSuppliers(suppliers);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao excluir fornecedor:', error);
        res.status(500).json({ error: 'Erro ao excluir fornecedor' });
    }
});

// Rota para servir as páginas HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/cadastro-fornecedor', (req, res) => {
    res.sendFile(path.join(__dirname, 'cadastro-fornecedor.html'));
});

// Iniciar o servidor
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
}

// Exportar a aplicação para ambientes serverless
module.exports = app;
