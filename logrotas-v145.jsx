import { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from "react";
import { useSwipeable } from "react-swipeable";
import { createPortal, flushSync } from "react-dom";
import {
  calculateRouteCosts,
  calculateFreteQuote,
  calculateProfitMeta,
  searchAddresses,
  resolvePlaceSuggestion,
  warmGeocodeProximity,
  getDriverGeolocation,
  fetchRouteTotalDistanceKm,
  resolveCalculatorStopsCoords,
  geocodeRomaneioExtractedAddresses,
  optimizeDeliveryRoute,
  optimizeDeliveryRouteHybrid,
  reoptimizeRemainingDeliveryRoute,
  findDuplicateStopIndex,
  resolveStopGeocodeBias,
  fetchRouteSegmentPath,
  buildParadasFromAddresses,
  resolveManualAddress,
  buildCalculatorStopSearchBias,
  openGoogleMapsDirections,
  openGoogleMapsNavigationToStop,
  filterNavigationStops,
} from "./src/services/routingService.js";
import { reverseGeocodeGoogle } from "./src/services/googleGeocodingService.js";
// V234 — import removido por engano no V226 (quebrava o "Calcular Viagem")
import { calculateTripCosts } from "./src/services/tripCalcService.js";
import {
  formatDurationApprox,
  calcularETAsParadas,
} from "./src/utils/etaUtils.js";
import { buscarPedagioRoutes } from "./src/services/routesTollService.js";
import {
  travelModePedagio,
  eixosFixosPerfil,
  EIXOS_CATEGORIA_CARRO,
} from "./src/services/pedagioCalcService.js";
import {
  formatMoeda,
  formatMoedaKm,
  formatKm,
  roundFreteCostsForSave,
  roundMoney,
  formatGraficoLucro,
  formatKmDecimal,
  formatDecimal,
  formatKwhPrice,
  formatConsumoKmL,
  formatEnquantoDigitaMoeda,
  formatEnquantoDigitaKm,
  formatMoedaParaCampo,
  formatKmParaCampo,
  parseNumeroBR,
  plural,
  pluralWord,
  pluralDias,
  pluralRegistros,
  pluralDocumentosVencidos,
  pluralDocumentosVence,
} from "./src/services/formatUtils.js";
import ScannerModule from "./src/components/ScannerModule.js";
import DeliveryMap from "./src/components/DeliveryMap.js";
import NavigationMap from "./src/components/NavigationMap.jsx";
import ProgressOverlay from "./src/components/ProgressOverlay.jsx";
import ChecklistVeiculo from "./src/components/ChecklistVeiculo.jsx";
import { listarChecklistsAvulsosRecentes, resumoChecklistAvulso, buscarChecklistPorFrete } from "./src/services/checklistService.js";
import {
  createChecklist,
  openChecklistForFrete,
  loadChecklist,
  listAvulsosEmAndamentoMerged,
} from "./src/services/checklistRepository.js";
import { initChecklistConnectivity } from "./src/services/checklistConnectivityService.js";
import { getChecklistSyncBadge, getChecklistPendingMediaLabel } from "./src/services/checklistSyncStatus.js";
import {
  writeChecklistSession,
  readChecklistSession,
  clearChecklistSession,
  etapaInicialParaChecklist,
} from "./src/services/checklistSessionService.js";
import {
  registrarConclusaoCalculadora,
  dispensarAvaliacao,
  enviarAvaliacao,
  reenviarAvaliacoesPendentes,
} from "./src/services/avaliacaoService.js";
import { incrementUsageCounter, touchUltimoAcesso, USAGE_COUNTERS } from "./src/services/usageStatsService.js";
import { logChecklist } from "./src/services/checklistLogSanitizer.js";
import {
  generateChecklistCompletoPdf,
  shareChecklistCompletoWhatsApp,
} from "./src/services/checklistColetaPdf.js";
import { loadDeliveryRoutes, saveDeliveryRoute, deleteDeliveryRoute } from "./src/services/deliveryRouteService.js";
import {
  saveDeliveryReportPdf,
  shareDeliveryReportWhatsApp,
  shareDeliveryReportEmail,
  sharePdfFileViaSystem,
} from "./src/services/deliveryReportPdf.js";
import {
  readNavigationSession,
  writeNavigationSession,
  clearNavigationSession,
} from "./src/services/navigationSessionService.js";
import {
  getParadaStatus,
  migrateParada,
  migrateParadas,
  pacoteDisplayName,
  resumoPacotesLabel,
  pacotesNumerosLabel,
  totalPacotesEmParadas,
  countPacotesStats,
  adicionarPacoteNaParada,
  criarParadaNova,
  marcarPacoteNaParada,
  sanitizeParadaForFirestore,
  logPacotes,
  dedupParadasPorId,
  countPacotes,
} from "./src/services/pacotesService.js";
import { OFFLINE_KEYS, AUTH_KEYS, readOfflineCache, writeOfflineCache, clearAllLogRotasStorage, clearVehiclesLocalCache, readVehiclesLocalCache, writeVehiclesLocalCache, mergeVehiclesWithDefaults, readCustoVeiculoLocalCache, writeCustoVeiculoLocalCache, readMetaMesLocalCache, writeMetaMesLocalCache, readPerfilLocalFallback, writePerfilLocalCache, readUiState, writeUiState, clearUiState } from "./src/services/offlineStorage.js";
import { planStateFromPerfil, perfilTemCamposAcesso, getPlanoAtual } from "./src/services/planoService.js";
import { podeUsar, incrementarUso, FREE_LIMITS, checarLimiteFree, MSG_LIMITE } from "./src/services/usoService.js";
import LimiteAtingido from "./src/components/LimiteAtingido.jsx";
import { subscribeAuth, signInWithEmail, signInWithGoogle, signOutUser, getAuthErrorMessage, sendPasswordResetEmail, getPasswordResetErrorMessage } from "./src/services/authService.js";
import { saveUserProfile, loadUserProfile, loadUserProfileWithTimeout, firestoreToPerfil, perfilToFirestorePayload, extractVehiclesFromProfile, saveUserVehicles, extractCustoVeiculoFromProfile, saveUserCustoVeiculo, extractMetaMesFromProfile, saveUserMetaMes } from "./src/services/userProfileService.js";
import {
  calcularCustoVeiculo,
  mediaKmMesUltimos3Meses,
  buildCustoVeiculoPersistPayload,
  formFromCustoVeiculoPersist,
  CUSTO_VEICULO_PADROES,
  resolveCustoKmSalvo,
  resolveCamposAusentesSalvo,
  formatAvisoCamposAusentes,
  hasCustoVeiculoPersistido,
  custoPersistDiffers,
  resolveOdometroAtual,
  listarProximasManutencoes,
  mergeCustoVeiculoOdometro,
} from "./src/services/custoVeiculoService.js";
import { compressImageToJpegBlob, uploadEmpresaLogo } from "./src/services/storageService.js";
import { saveJornada } from "./src/services/jornadaService.js";
import {
  subscribeUserHistory,
  addFreteWithFinanceiro,
  updateFreteWithFinanceiro,
  deleteFreteWithFinanceiro,
  addDespesaWithFinanceiro,
  updateDespesaWithFinanceiro,
  deleteDespesaWithFinanceiro,
  addManutencaoWithFinanceiro,
  updateManutencaoWithFinanceiro,
  deleteManutencaoWithFinanceiro,
  addDocumento,
  deleteDocumento,
  clearAllUserHistory,
  updateHistoryItem,
  deleteHistoryItem,
  HISTORY_COLLECTIONS,
} from "./src/services/userHistoryService.js";
import {
  CheckIcon, XIcon, ZapIcon, UsersIcon, StarIcon,
  ArrowRightIcon, ArrowLeftIcon, LockIcon,
  HomeIcon, WrenchIcon, CalendarIcon, FileTextIcon, AlertTriangleIcon,
  BellIcon, PlusIcon, Trash2Icon, PlusCircleIcon,
  NavigationIcon, CalculatorIcon, BarChart3Icon, FuelIcon,
  TrendingUpIcon, TrendingDownIcon, DollarSignIcon, MapPinIcon,
  EyeIcon, EyeOffIcon, MailIcon, RouteIcon, InfoIcon,
  LogOutIcon, EditIcon, PenLineIcon, SaveIcon, ChevronLeftIcon, ChevronRightIcon,
  ThumbsUpIcon, ThumbsDownIcon, SettingsIcon, RefreshCwIcon,
} from "lucide-react";

// ── OPENROUTESERVICE — autocomplete e distância real ─────────────────────────
// ── SISTEMA DE INDICAÇÃO ─────────────────────────────────────────────────────
// BASE_URL: troque por seu domínio real ao publicar no Vercel
const BASE_URL="https://logrotas.vercel.app";
const APP_VERSION="v352";
const SUPORTE_EMAIL="suporte@logrotas.com.br";
const PEDAGIO_AVISO_RESULTADO="Pedágio estimado pelo Google. Pode haver variação — confirme o valor da praça.";
const PAGE_SWIPE_ORDER=["dashboard","financeiro","despesas","comparador","manutencao","documentos","perfil"];
const PAGE_SWIPE_MIN_PX=30;
const PAGE_SWIPE_DELTA=28;
const PAGE_SWIPE_H_MIN_RATIO=0.8;
const MIN_SPLASH_MS=400;

const OfflineRestoredBanner=({show})=>show?(
  <div style={{background:"#F0F9FF",border:"1px solid #BAE6FD",borderRadius:8,padding:"6px 12px",marginBottom:10,fontSize:11,color:"#0369A1",fontWeight:600,textAlign:"center"}}>
    📶 Dados restaurados
  </div>
):null;

// Monta o link de indicação do usuário
// Ex: https://logrotas.vercel.app?ref=11987354715
const montarLinkIndicacao=(whatsappOuId)=>{
  const id=String(whatsappOuId).replace(/\D/g,"")||"usuario";
  return `${BASE_URL}?ref=${id}`;
};

// true → abre WhatsApp com convite; false → aviso "Em breve" (legado beta)
const REFERRAL_ENABLED=true;

// V231 — Toggle de segurança do motor de otimização de rotas.
// true  → motor híbrido novo: GPS fresco como origem + Nearest Neighbor + 2-opt
//         no aparelho (rota aberta, 100+ paradas) + Directions em blocos de 25
//         só para desenho/métricas reais (sem optimizeWaypoints).
// false → comportamento antigo intacto (optimizeDeliveryRoute com
//         optimizeWaypoints da Directions API, código preservado).
const USE_HYBRID_OPTIMIZER=true;

const MSG_INDICACAO="Tô usando um app brasileiro que tá me ajudando muito no dia a dia, o LogRotas:\n\n🗺️ Monta e otimiza rota com várias paradas\n💰 Calcula pedágio, combustível e quanto cobrar no frete\n📋 Checklist com foto e assinatura\n📊 Controle do que entra e do que sai\n\nFeito pra quem vive de estrada. Dá uma olhada: https://logrotas.com.br";

// Abre WhatsApp com convite simples (sem menção a plano/benefício/recompensa).
// Mobile/PWA: navega com location.href (window.open costuma falhar no Android).
// Fallback (ex.: desktop): copia a mensagem e avisa via toast — sem alert() nativo.
const compartilharIndicacao=async(onFallbackToast)=>{
  const url=`https://wa.me/?text=${encodeURIComponent(MSG_INDICACAO)}`;
  try{
    window.location.href=url;
    return;
  }catch{/* navegação indisponível */}
  try{
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(MSG_INDICACAO);
      onFallbackToast?.("Mensagem copiada! Cole no WhatsApp para enviar.");
      return;
    }
  }catch{/* clipboard indisponível */}
  onFallbackToast?.("Não foi possível abrir o WhatsApp. Tente de novo pelo celular.");
};

// SEGURANÇA: Em produção, mova esta chave para um backend Node.js/Firebase Function.
// Fluxo seguro: App → POST /api/geocode (seu servidor) → ORS API → resposta de volta.
// Assim a chave nunca fica exposta no código frontend.
// Para Firebase Functions: functions.https.onCall((data) => fetch(ORS_URL, {headers:{Authorization: process.env.ORS_KEY}}))

// V173 — autocomplete SP (strict bounds) + voz nas calculadoras
const AddressInput=({value,onChange,onSelect,placeholder,dotColor,disabled,enableVoice,enableMyLocation=false,searchOptions,calc=false})=>{
  const[sugestoes,setSugestoes]=useState([]);
  const[loading,setLoading]=useState(false);
  const[aberto,setAberto]=useState(false);
  const[ouvindo,setOuvindo]=useState(false);
  const[localizando,setLocalizando]=useState(false);
  const[locErro,setLocErro]=useState("");
  const timerRef=useRef(null);
  const recognitionRef=useRef(null);
  const cor=dotColor||C.green;
  const speechOk=typeof window!=="undefined"&&(window.SpeechRecognition||window.webkitSpeechRecognition);
  const idleBorder=calc?C.calcBorder:C.border;
  const listaVisivel=aberto&&(enableMyLocation||sugestoes.length>0);

  useEffect(()=>{
    warmGeocodeProximity();
    return()=>{
      if(timerRef.current)clearTimeout(timerRef.current);
      try{recognitionRef.current?.stop();}catch(_){}
    };
  },[]);

  const iniciarVoz=()=>{
    if(disabled||!enableVoice||!speechOk||ouvindo)return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const rec=new SR();
    rec.lang="pt-BR";
    rec.interimResults=false;
    rec.maxAlternatives=1;
    recognitionRef.current=rec;
    rec.onresult=e=>{
      const texto=(e.results?.[0]?.[0]?.transcript||"").trim();
      if(texto)handleChange(texto);
    };
    rec.onerror=()=>setOuvindo(false);
    rec.onend=()=>setOuvindo(false);
    setOuvindo(true);
    rec.start();
  };

  const handleChange=v=>{
    if(disabled)return;
    onChange(v);
    setLocErro("");
    if(timerRef.current)clearTimeout(timerRef.current);
    if(v.length<3){setSugestoes([]);setAberto(false);return;}
    setLoading(true);
    timerRef.current=setTimeout(async()=>{
      const bias=typeof searchOptions==="function"?searchOptions():searchOptions||{};
      const res=await searchAddresses(v,bias);
      const list=res.ok?res.suggestions:[];
      setSugestoes(list);setAberto(enableMyLocation||list.length>0);setLoading(false);
    },400);
  };

  const selecionar=async s=>{
    setLoading(true);
    try{
      const resolved=await resolvePlaceSuggestion(s);
      onChange(resolved.label);
      onSelect&&onSelect(resolved);
      setSugestoes([]);setAberto(false);setLocErro("");
    }finally{
      setLoading(false);
    }
  };

  const usarMeuLocal=async()=>{
    if(disabled||localizando)return;
    setLocErro("");
    setLocalizando(true);
    try{
      const pos=await new Promise((resolve,reject)=>{
        if(typeof navigator==="undefined"||!navigator.geolocation){
          reject(new Error("no_geo"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {enableHighAccuracy:true,timeout:8000}
        );
      });
      const lat=pos.coords.latitude;
      const lng=pos.coords.longitude;
      const rev=await reverseGeocodeGoogle(lat,lng);
      const endereco=rev?.formattedAddress||`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const resolved={label:endereco,coords:[lng,lat]};
      onChange(endereco);
      onSelect&&onSelect(resolved);
      setSugestoes([]);setAberto(false);
    }catch{
      setLocErro("Não foi possível obter sua localização");
    }finally{
      setLocalizando(false);
    }
  };

  return(
    <div style={{position:"relative",flex:1,minWidth:0,zIndex:aberto?10002:"auto"}}>
      <div style={{display:"flex",alignItems:calc?"stretch":"center",background:disabled?C.subtle:"#fff",border:`1.5px solid ${idleBorder}`,borderRadius:10,boxShadow:calc?"0 1px 2px #1E3A8A0A":"0 1px 3px #1E3A8A08",transition:"border-color .15s",opacity:disabled?0.7:1,...(calc?{minHeight:CALC_INPUT_ROW_H}:{})}}
        onFocusCapture={e=>{if(!disabled)e.currentTarget.style.borderColor=C.orange;}}
        onBlurCapture={e=>e.currentTarget.style.borderColor=idleBorder}>
        <div style={{width:10,height:10,borderRadius:"50%",background:cor,border:"2px solid #fff",boxShadow:`0 0 0 1.5px ${cor}`,flexShrink:0,marginLeft:12,...(calc?{alignSelf:"center"}:{})}}/>
        <input value={value} onChange={e=>handleChange(e.target.value)} placeholder={placeholder} disabled={disabled}
          style={{flex:1,background:"transparent",border:"none",outline:"none",color:disabled?C.muted:C.text,cursor:disabled?"not-allowed":"text",...(calc?{...calcFieldInputStyle,alignSelf:"stretch"}:{padding:"10px 8px 10px 12px",fontSize:14,minWidth:0})}}
          onFocus={()=>{if(!disabled&&(enableMyLocation||sugestoes.length>0)){setAberto(true);setLocErro("");}}}
          onBlur={()=>setTimeout(()=>setAberto(false),200)}/>
        {enableVoice&&speechOk&&(
          <button type="button" onMouseDown={e=>e.preventDefault()} onClick={iniciarVoz} disabled={disabled||ouvindo} title="Falar endereço"
            style={{background:ouvindo?"#FEE2E2":"transparent",border:"none",borderRadius:8,padding:"6px 8px",marginRight:4,cursor:disabled||ouvindo?"not-allowed":"pointer",fontSize:15,lineHeight:1,opacity:disabled?0.5:1,...(calc?{alignSelf:"center"}:{})}}>
            {ouvindo?"🔴":"🎤"}
          </button>
        )}
      </div>
      {locErro&&(
        <div style={{color:"#DC2626",fontSize:11,marginTop:4,paddingLeft:2}}>{locErro}</div>
      )}
      {listaVisivel&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:12,boxShadow:"0 8px 24px #1E3A8A18",zIndex:9999,overflow:"hidden"}}>
          {enableMyLocation&&(
            <button type="button" onMouseDown={e=>{e.preventDefault();usarMeuLocal();}} disabled={localizando}
              style={{width:"100%",background:localizando?C.subtle:"none",border:"none",padding:"10px 14px",cursor:localizando?"wait":"pointer",textAlign:"left",borderBottom:sugestoes.length>0?`1px solid ${C.border}`:"none",display:"flex",alignItems:"center",gap:8,opacity:localizando?0.85:1}}
              onMouseEnter={e=>{if(!localizando)e.currentTarget.style.background=C.subtle;}}
              onMouseLeave={e=>{if(!localizando)e.currentTarget.style.background=localizando?C.subtle:"none";}}>
              <span style={{fontSize:14,flexShrink:0}}>📍</span>
              <span style={{color:C.navy,fontSize:12,fontWeight:700,lineHeight:1.4}}>{localizando?"Buscando sua localização...":"Usar meu local"}</span>
            </button>
          )}
          {sugestoes.map((s,i)=>(
            <button key={i} onMouseDown={e=>{e.preventDefault();selecionar(s);}}
              style={{width:"100%",background:"none",border:"none",padding:"10px 14px",cursor:"pointer",textAlign:"left",borderBottom:i<sugestoes.length-1?`1px solid ${C.border}`:"none",display:"flex",alignItems:"flex-start",gap:8}}
              onMouseEnter={e=>e.currentTarget.style.background=C.subtle}
              onMouseLeave={e=>e.currentTarget.style.background="none"}>
              <MapPinIcon size={12} color={C.orange} style={{flexShrink:0,marginTop:2}}/>
              <span style={{color:C.text,fontSize:12,lineHeight:1.4}}>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const C = {
  bg:"#F4F6FA", surface:"#FFFFFF", card:"#FFFFFF", border:"#E4E9F0",
  calcBorder:"#CBD5E1",
  navy:"#1E3A8A", navyLight:"#EEF4FF", navyMid:"#2952C8",
  orange:"#E85D04", orangeLight:"#FFF0E8",
  green:"#0A7C50", greenLight:"#E6F7F1",
  red:"#C0392B", redLight:"#FDECEA",
  amber:"#C47800", amberLight:"#FFF8E6",
  electric:"#2563EB", electricLight:"#DBEAFE",
  purple:"#7C3AED", purpleLight:"#EDE9FE",
  text:"#1A2B42", text2:"#4A607A", muted:"#8EA3BC", subtle:"#F0F4FA",
};


// ── LOGO — SVG oficial LogRotas ──────────────────────────────────────────────
const LogRotasLogo = ({size=32,showText=false}) => (
  <div style={{display:"flex",alignItems:"center",gap:10}}>
    <svg width={size} height={size} viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
      <g fill="#003d6b">
        <path d="M 250,110 A 110,110 0 0 1 360,220 L 320,220 L 380,290 L 440,220 L 400,220 A 150,150 0 0 0 250,70 Z"/>
        <path d="M 250,390 A 110,110 0 0 1 140,280 L 180,280 L 120,210 L 60,280 L 100,280 A 150,150 0 0 0 250,430 Z"/>
      </g>
      <g fill="#ff6a00">
        <path d="M 250,250 C 200,200 150,300 100,300 L 110,330 L 40,300 L 90,230 L 100,260 C 150,260 200,160 250,210 Z"/>
        <path d="M 250,250 C 300,300 350,200 400,200 L 390,170 L 460,200 L 410,270 L 400,240 C 350,240 300,340 250,290 Z"/>
        <path d="M 430,40 C 418,40 408,50 408,62 C 408,78 430,105 430,105 C 430,105 452,78 452,62 C 452,50 442,40 430,40 Z M 430,72 C 424,72 420,68 420,62 C 420,56 424,52 430,52 C 436,52 440,56 440,62 C 440,68 436,72 430,72 Z"/>
      </g>
    </svg>
    {showText&&<div style={{display:"flex",alignItems:"baseline"}}>
      <span style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:size*0.6,color:"#003d6b",lineHeight:1}}>Log</span>
      <span style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:size*0.6,color:"#ff6a00",lineHeight:1}}>Rotas</span>
    </div>}
  </div>
);

// ── SHARED COMPONENTS ─────────────────────────────────────────────────────────
const Tag=({label,color,bg})=><span style={{background:bg,color,padding:"3px 10px",borderRadius:20,fontSize:12,fontWeight:700}}>{label}</span>;
const Card=({children,style={}})=><div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,overflow:"hidden",boxShadow:"0 2px 8px #1E3A8A08",...style}}>{children}</div>;
const CardHeader=({title,action})=>(
  <div style={{padding:"15px 20px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
    <span style={{color:C.text,fontWeight:700,fontFamily:"'Sora',sans-serif",fontSize:15}}>{title}</span>
    {action}
  </div>
);
const Metric=({label,value,sub,trend,icon:Icon,color,bg})=>{
  const valStr=String(value||"");
  const valSize=valStr.length>14?16:valStr.length>11?18:21;
  return(
  <div style={{background:bg||C.navyLight,border:`1px solid ${color}22`,borderRadius:14,padding:"16px 18px",minWidth:0}}>
    <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
      <div style={{background:color+"22",borderRadius:8,padding:5}}><Icon size={14} color={color}/></div>
      <span style={{color:C.text2,fontSize:11,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"}}>{label}</span>
    </div>
    <div style={{color:C.text,fontSize:valSize,fontWeight:900,fontFamily:"'Sora',sans-serif",lineHeight:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{value}</div>
    {sub&&<div style={{color:trend==="up"?C.green:trend==="down"?C.red:C.muted,fontSize:12,marginTop:5}}>{sub}</div>}
  </div>
);};
const PrimaryBtn=({children,onClick,variant="orange",disabled,small,style:s={}})=>{
  const v={orange:{bg:C.orange,color:"#fff",sh:C.orange},navy:{bg:C.navy,color:"#fff",sh:C.navy},red:{bg:C.red,color:"#fff",sh:C.red},electric:{bg:C.electric,color:"#fff",sh:C.electric},green:{bg:C.green,color:"#fff",sh:C.green}}[variant]||{bg:C.orange,color:"#fff",sh:C.orange};
  return <button type="button" onClick={onClick} disabled={disabled} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:disabled?C.border:v.bg,color:disabled?C.muted:v.color,border:"none",borderRadius:11,padding:small?"8px 14px":"11px 18px",cursor:disabled?"not-allowed":"pointer",fontWeight:700,fontSize:small?12:13,fontFamily:"'Sora',sans-serif",boxShadow:disabled?"none":`0 3px 10px ${v.sh}44`,...s}}>{children}</button>;
};

// V292 — filtro por mês (data "DD/MM/YYYY") reutilizado por Despesas/Manutenção
const filtrarPorMesData=(arr,m,a)=>(arr||[]).filter(x=>{
  if(!x?.date)return false;
  const p=x.date.split("/");
  return p.length===3&&parseInt(p[1])-1===m&&parseInt(p[2])===a;
});
// V292 — navegação Anterior/Próximo por mês (mesmo padrão visual do Financeiro)
const MonthNav=({mes,ano,onPrev,onNext})=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.navyLight,borderRadius:13,padding:"10px 16px"}}>
    <button onClick={onPrev} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"6px 12px",cursor:"pointer",color:C.navy,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
      <ChevronLeftIcon size={13}/> Anterior
    </button>
    <span style={{color:C.navy,fontWeight:800,fontSize:14,fontFamily:"'Sora',sans-serif"}}>{MESES_PT[mes]} {ano}</span>
    <button onClick={onNext} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"6px 12px",cursor:"pointer",color:C.navy,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
      Próximo <ChevronRightIcon size={13}/>
    </button>
  </div>
);

// V286 — botão único de navegação (Google Maps) nas calculadoras
const BotaoNavegar=({stops})=>{
  if(!filterNavigationStops(stops).length)return null;
  return(
    <button type="button" onClick={()=>openGoogleMapsDirections(stops)}
      style={{width:"100%",padding:"13px",background:C.navy,border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
      🧭 Navegar
    </button>
  );
};
const ModalWrap=({children,maxW=480})=>(
  <div style={{position:"fixed",inset:0,background:"#1E3A8A33",zIndex:300,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"12px",overflowY:"auto",overflowX:"hidden",maxWidth:"100vw",boxSizing:"border-box"}}>
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:maxW,padding:24,marginTop:10,marginBottom:12,boxShadow:"0 20px 60px #1E3A8A18",overflowX:"hidden",boxSizing:"border-box"}}>{children}</div>
  </div>
);
const ModalFormLayout=({children,footer,maxBodyHeight="calc(100dvh - 220px)"})=>(
  <div style={{display:"flex",flexDirection:"column",maxHeight:maxBodyHeight}}>
    <div style={{flex:1,overflowY:"auto",overflowX:"hidden",marginBottom:16,paddingRight:2,WebkitOverflowScrolling:"touch"}}>
      {children}
    </div>
    {footer&&(
      <div style={{flexShrink:0,paddingTop:12,borderTop:`1px solid ${C.border}`,background:C.surface}}>
        {footer}
      </div>
    )}
  </div>
);
const ModalHeader=({title,sub,icon:Icon,iconColor,onClose})=>(
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
    <div style={{display:"flex",alignItems:"center",gap:10}}>
      {Icon&&<div style={{background:iconColor+"18",borderRadius:9,padding:7}}><Icon size={17} color={iconColor}/></div>}
      <div><div style={{color:C.text,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif"}}>{title}</div>{sub&&<div style={{color:C.muted,fontSize:12,marginTop:1}}>{sub}</div>}</div>
    </div>
    <button onClick={onClose} style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:9,padding:7,cursor:"pointer",color:C.muted,display:"flex"}}><XIcon size={15}/></button>
  </div>
);
const ConfirmDialog=({message,onConfirm,onCancel,confirmLabel="Confirmar"})=>(
  <div style={{position:"fixed",inset:0,background:"#1E3A8A55",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:340,padding:26,textAlign:"center",boxShadow:"0 20px 60px #00000022"}}>
      <div style={{color:C.navy,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif",marginBottom:22,lineHeight:1.5}}>{message}</div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{flex:1,padding:"11px 0",background:C.subtle,border:`1px solid ${C.border}`,borderRadius:11,color:C.text2,fontWeight:600,fontSize:14,cursor:"pointer"}}>Cancelar</button>
        <button onClick={onConfirm} style={{flex:1,padding:"11px 0",background:C.red,border:"none",borderRadius:11,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>{confirmLabel}</button>
      </div>
    </div>
  </div>
);

const DeleteConfirm=({message,onConfirm,onCancel,error})=>(
  <div style={{position:"fixed",inset:0,background:"#1E3A8A44",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
    <div style={{background:C.surface,border:`1px solid ${C.red}33`,borderRadius:20,width:"100%",maxWidth:340,padding:26,textAlign:"center",boxShadow:"0 20px 60px #00000022"}}>
      <div style={{width:56,height:56,borderRadius:"50%",background:C.redLight,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px"}}><Trash2Icon size={26} color={C.red}/></div>
      <div style={{color:C.navy,fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif",marginBottom:8}}>Confirmar exclusão?</div>
      <div style={{color:C.muted,fontSize:14,marginBottom:error?12:22,lineHeight:1.5}}>{message}</div>
      {error&&<div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",color:"#DC2626",fontSize:13,fontWeight:600,marginBottom:22,textAlign:"left"}}>⚠️ {error}</div>}
      <div style={{display:"flex",gap:10}}>
        <button onClick={onCancel} style={{flex:1,padding:"11px 0",background:C.subtle,border:`1px solid ${C.border}`,borderRadius:11,color:C.text2,fontWeight:600,fontSize:14,cursor:"pointer"}}>Cancelar</button>
        <button onClick={onConfirm} style={{flex:1,padding:"11px 0",background:C.red,border:"none",borderRadius:11,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>Excluir</button>
      </div>
    </div>
  </div>
);

// Fully controlled field
const CALC_INPUT_BORDER=C.calcBorder;
const CALC_ROTA_GAP=12;
const CALC_INPUT_ROW_H=44;
const calcFieldInputStyle={padding:"10px 12px",fontSize:14,minWidth:0,boxSizing:"border-box"};
const Field=({label,value,onChange,placeholder,prefix,suffix,type="text",hint,readOnly=false,calc=false})=>{
  const [focused,setFocused]=useState(false);
  const inputRef=useRef(null);
  const isMoney=prefix==="R$";
  const isKm=String(suffix||"").toLowerCase()==="km";
  const isNumeric=!!(prefix||suffix)&&type==="text";
  const idleBorder=calc?CALC_INPUT_BORDER:C.border;
  const idleBg=calc?"#fff":C.subtle;
  const displayValue=isMoney?formatMoedaParaCampo(value):isKm?formatKmParaCampo(value):value;
  useLayoutEffect(()=>{
    if((!isMoney&&!isKm)||!focused)return;
    const el=inputRef.current;
    if(el&&document.activeElement===el){
      const len=String(el.value||"").length;
      el.setSelectionRange(len,len);
    }
  },[displayValue,isMoney,isKm,focused]);
  const handleChange=(e)=>{
    if(readOnly)return;
    const raw=e.target.value;
    onChange(isMoney?formatEnquantoDigitaMoeda(raw):isKm?formatEnquantoDigitaKm(raw):raw);
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label&&<label style={{color:C.text2,fontSize:14,fontWeight:700,letterSpacing:0.4}}>{label}</label>}
      <div style={{display:"flex",alignItems:"center",background:readOnly?C.subtle:focused?C.surface:idleBg,border:`1.5px solid ${readOnly?C.border:focused?C.orange:idleBorder}`,borderRadius:10,overflow:"hidden",transition:"border .15s",boxShadow:calc&&!focused&&!readOnly?"0 1px 2px #1E3A8A0A":"none",...(calc?{minHeight:CALC_INPUT_ROW_H}:{})}}>
        {prefix&&<span style={{padding:"0 10px",color:C.muted,fontSize:12,flexShrink:0,borderRight:`1px solid ${C.border}`,background:"#fff",alignSelf:"stretch",display:"flex",alignItems:"center"}}>{prefix}</span>}
        <input ref={inputRef} type={type} inputMode={isNumeric||type==="number"?"decimal":undefined} value={displayValue} onChange={handleChange} onFocus={()=>!readOnly&&setFocused(true)} onBlur={()=>setFocused(false)} placeholder={placeholder}
          readOnly={readOnly}
          style={{flex:1,background:"transparent",border:"none",outline:"none",color:readOnly?C.muted:C.text,...calcFieldInputStyle,cursor:readOnly?"default":"text"}}/>
        {suffix&&<span style={{padding:"0 10px",color:C.muted,fontSize:12,flexShrink:0,borderLeft:`1px solid ${C.border}`,background:"#fff",alignSelf:"stretch",display:"flex",alignItems:"center"}}>{suffix}</span>}
      </div>
      {hint&&<div style={{color:C.muted,fontSize:11}}>{hint}</div>}
    </div>
  );
};
// V235 — seletor de reboque compartilhado (Calculadora de Fretes + Calculadora de Viagem)
const TrailerSelector=({options,value,onChange,title="Reboque / Carretinha"})=>(
  <div>
    <div style={{color:C.text2,fontSize:14,fontWeight:700,letterSpacing:0.4,marginBottom:8}}>{title}</div>
    <div style={{display:"flex",gap:7,minWidth:0,maxWidth:"100%"}}>
      {options.map(t=>(
        <button key={t.id} type="button" onClick={()=>onChange(t.id)}
          style={{flex:1,minWidth:0,background:value===t.id?C.navyLight:"#fff",border:`2px solid ${value===t.id?C.navy:C.border}`,borderRadius:11,padding:"9px 6px",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
          <div style={{fontSize:18,marginBottom:3}}>{t.emoji}</div>
          <div style={{color:value===t.id?C.navy:C.text,fontWeight:600,fontSize:11}}>{t.label}</div>
          <div style={{color:C.muted,fontSize:9,marginTop:1}}>{t.desc}</div>
        </button>
      ))}
    </div>
  </div>
);
const SelectField=({label,value,onChange,options})=>{
  const[focused,setFocused]=useState(false);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label&&<label style={{color:C.text2,fontSize:14,fontWeight:700,letterSpacing:0.4}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)}
        onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)}
        style={{background:C.subtle,border:`1.5px solid ${focused?C.orange:C.border}`,borderRadius:10,color:C.text,padding:"10px 12px",fontSize:14,outline:"none",transition:"border .15s"}}>
        {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </div>
  );
};

// Date Picker
const MONTHS=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DAYS_S=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const DatePicker=({label,value,onChange,fullScreen=false})=>{
  const [open,setOpen]=useState(false);
  const [view,setView]=useState(()=>{if(value){const[d,m,y]=value.split("/");return new Date(y,m-1,1);}return new Date();});
  const ref=useRef();
  const calRef=useRef();
  useEffect(()=>{if(!fullScreen){const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);}},[fullScreen]);
  useEffect(()=>{
    if(!open||fullScreen)return;
    const timer=setTimeout(()=>{
      (calRef.current||ref.current)?.scrollIntoView({behavior:"smooth",block:"center",inline:"nearest"});
    },60);
    return()=>clearTimeout(timer);
  },[open,fullScreen]);
  const y=view.getFullYear(),m=view.getMonth(),fd=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();
  const sD=value?parseInt(value.split("/")[0]):null,sM=value?parseInt(value.split("/")[1])-1:null,sY=value?parseInt(value.split("/")[2]):null;
  const pickDay=(day)=>{onChange(`${String(day).padStart(2,"0")}/${String(m+1).padStart(2,"0")}/${y}`);setOpen(false);};
  const calPanel=(
    <>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:fullScreen?16:12}}>
        <button type="button" onClick={()=>setView(new Date(y,m-1,1))} style={{background:C.subtle,border:"none",borderRadius:8,padding:fullScreen?10:6,cursor:"pointer",display:"flex"}}><ChevronLeftIcon size={fullScreen?18:14} color={C.text2}/></button>
        <span style={{color:C.navy,fontWeight:800,fontSize:fullScreen?18:14,fontFamily:"'Sora',sans-serif"}}>{MONTHS[m]} {y}</span>
        <button type="button" onClick={()=>setView(new Date(y,m+1,1))} style={{background:C.subtle,border:"none",borderRadius:8,padding:fullScreen?10:6,cursor:"pointer",display:"flex"}}><ChevronRightIcon size={fullScreen?18:14} color={C.text2}/></button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:fullScreen?4:2,marginBottom:fullScreen?10:6}}>
        {DAYS_S.map(d=><div key={d} style={{textAlign:"center",color:C.muted,fontSize:fullScreen?12:10,fontWeight:700,padding:fullScreen?"6px 0":"3px 0"}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:fullScreen?4:2}}>
        {Array.from({length:fd}).map((_,i)=><div key={`e${i}`}/>)}
        {Array.from({length:days}).map((_,i)=>{
          const day=i+1,isSel=day===sD&&m===sM&&y===sY,isToday=day===new Date().getDate()&&m===new Date().getMonth()&&y===new Date().getFullYear();
          return <button type="button" key={day} onClick={()=>pickDay(day)} style={{textAlign:"center",padding:fullScreen?"12px 0":"6px 0",borderRadius:fullScreen?10:8,border:"none",cursor:"pointer",fontSize:fullScreen?15:12,fontWeight:isSel?800:400,background:isSel?C.orange:isToday?C.orangeLight:"transparent",color:isSel?"#fff":isToday?C.orange:C.text}}>{day}</button>;
        })}
      </div>
      <div style={{marginTop:fullScreen?16:10,display:"flex",gap:fullScreen?8:5,justifyContent:"center",flexWrap:"wrap"}}>
        {[y-1,y,y+1,y+2].map(yr=><button type="button" key={yr} onClick={()=>setView(new Date(yr,m,1))} style={{padding:fullScreen?"8px 14px":"3px 8px",borderRadius:fullScreen?8:6,border:"none",cursor:"pointer",background:yr===y?C.navy:C.subtle,color:yr===y?"#fff":C.text2,fontSize:fullScreen?14:12,fontWeight:600}}>{yr}</button>)}
      </div>
    </>
  );
  return(
    <div ref={ref} style={{display:"flex",flexDirection:"column",gap:5,position:"relative"}}>
      {label&&<label style={{color:C.text2,fontSize:14,fontWeight:700,letterSpacing:0.4}}>{label}</label>}
      <button type="button" onClick={()=>setOpen(o=>!o)} style={{display:"flex",alignItems:"center",gap:8,background:C.subtle,border:`1.5px solid ${open?C.orange:C.border}`,borderRadius:10,padding:"10px 12px",cursor:"pointer",color:value?C.text:C.muted,fontSize:14,textAlign:"left"}}>
        <CalendarIcon size={14} color={open?C.orange:C.muted}/>{value||"Selecionar data"}
      </button>
      {open&&!fullScreen&&(
        <div ref={calRef} style={{marginTop:6,background:C.surface,border:`1px solid ${C.border}`,borderRadius:14,padding:16,boxShadow:"0 4px 16px #1E3A8A12",minWidth:280}}>
          {calPanel}
        </div>
      )}
      {open&&fullScreen&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"#1E3A8A55",display:"flex",flexDirection:"column",padding:"max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom))",boxSizing:"border-box",overflowY:"auto",WebkitOverflowScrolling:"touch"}} onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false);}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",width:"100%",maxWidth:520,margin:"0 auto",minHeight:"min(100%, 640px)"}}>
            <div ref={calRef} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:fullScreen?24:16,boxShadow:"0 20px 60px #1E3A8A22",width:"100%",boxSizing:"border-box"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <div style={{color:C.navy,fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif"}}>Selecionar data</div>
                <button type="button" onClick={()=>setOpen(false)} style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:9,padding:7,cursor:"pointer",color:C.muted,display:"flex"}}><XIcon size={15}/></button>
              </div>
              {calPanel}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Stops field — botão entre origem e destino
const StopsField=({stops,setStops,originLabel,destLabel})=>{
  const nid=useRef(200);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:7}}>
      {/* Paradas existentes */}
      {stops.map((stop,i)=>(
        <div key={stop.id} style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:C.orange,flexShrink:0}}/>
          <input value={stop.v} onChange={e=>setStops(s=>s.map(x=>x.id===stop.id?{...x,v:e.target.value}:x))} placeholder={`Parada ${i+1}`}
            style={{flex:1,background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:10,outline:"none",color:C.text,padding:"9px 12px",fontSize:14}}
            onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
          <button onClick={()=>setStops(s=>s.filter(x=>x.id!==stop.id))} style={{background:C.redLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.red,display:"flex",flexShrink:0}}><Trash2Icon size={13}/></button>
        </div>
      ))}
      {/* Botão entre origem e destino */}
      {stops.length<6&&(
        <button onClick={()=>setStops(s=>[...s,{id:nid.current++,v:""}])}
          style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:"transparent",border:`1.5px dashed ${C.orange}77`,borderRadius:10,padding:"7px 13px",cursor:"pointer",color:C.orange,fontWeight:600,fontSize:12,width:"100%"}}>
          <PlusCircleIcon size={12}/> + Adicionar parada intermediária
        </button>
      )}
    </div>
  );
};

// ── GLOBAL VEHICLE STATE — single source of truth, shared between tabs ────────
// axles: Moto=2 (informativo), Carro=2, Elétrico=2, Caminhão=editável (pedágio)
const DEFAULT_VEHICLES = [
  {id:"moto",     label:"Moto",          emoji:"🏍️",  axles:2, consumption:25,  electric:false, kwh:0   },
  {id:"carro",    label:"Carro",         emoji:"🚗",  axles:2, consumption:12,  electric:false, kwh:0   },
  {id:"eletrico", label:"Carro Elétrico",emoji:"🚙", axles:2, consumption:0,   electric:true,  kwh:1.85},
  {id:"caminhao", label:"Caminhão",      emoji:"🚛",  axles:2, consumption:3.5, electric:false, kwh:0   },
];

// Trailer options — +1 and +2 axles, also editable

// ── STATIC DATA ───────────────────────────────────────────────────────────────
const INIT_FUEL=[
  {id:1,city:"São Paulo, SP",     diesel:6.18,gas:6.49,etanol:4.89,gnv:4.25,arla:4.50},
  {id:2,city:"Rio de Janeiro, RJ",diesel:6.34,gas:6.72,etanol:5.10,gnv:4.40,arla:4.65},
  {id:3,city:"Curitiba, PR",      diesel:5.98,gas:6.21,etanol:4.72,gnv:4.10,arla:4.38},
  {id:4,city:"Belo Horizonte, MG",diesel:6.10,gas:6.38,etanol:4.80,gnv:4.20,arla:4.45},
  {id:5,city:"Porto Alegre, RS",  diesel:6.05,gas:6.30,etanol:4.75,gnv:4.15,arla:4.40},
  {id:6,city:"Salvador, BA",      diesel:6.42,gas:6.78,etanol:5.20,gnv:4.55,arla:4.75},
  {id:7,city:"Goiânia, GO",       diesel:6.08,gas:6.35,etanol:4.78,gnv:4.18,arla:4.43},
  {id:8,city:"Manaus, AM",        diesel:6.60,gas:6.95,etanol:5.40,gnv:4.70,arla:4.85},
];
const INIT_CHARGING=[
  {id:1,city:"São Paulo, SP",     kwh:1.85},
  {id:2,city:"Rio de Janeiro, RJ",kwh:1.92},
  {id:3,city:"Curitiba, PR",      kwh:1.78},
];
const INIT_ROUTES=[];
const INIT_MAINT=[];
const INIT_DOCS=[];
const INIT_SCHED=[];
const INIT_STYPE=["Troca de Óleo","Filtro de Ar","Filtro de Combustível","Troca de Pneu","Revisão Geral","Troca de Correia","Alinhamento","Balanceamento","Troca de Freios","Outros"];
const routeSt={"concluída":{bg:C.greenLight,color:C.green,label:"Concluída"},"em andamento":{bg:C.orangeLight,color:C.orange,label:"Em Andamento"},"planejada":{bg:C.amberLight,color:C.amber,label:"Planejada"}};
const docSt={ok:{bg:C.greenLight,color:C.green,label:"✓ Válido"},vencendo:{bg:C.amberLight,color:C.amber,label:"⚠ Vencendo"},vencido:{bg:C.redLight,color:C.red,label:"✕ Vencido"}};
const schedSt={confirmada:{bg:C.greenLight,color:C.green,label:"Confirmada"},pendente:{bg:C.amberLight,color:C.amber,label:"Pendente"}};

// ── AUTH ──────────────────────────────────────────────────────────────────────
const LoginScreen=()=>{
  const[email,setEmail]=useState("");
  const[pass,setPass]=useState("");
  const[rememberMe,setRememberMe]=useState(false);
  const[show,setShow]=useState(false);
  const[loading,setLoading]=useState(false);
  const[erro,setErro]=useState("");
  const[showRecuperar,setShowRecuperar]=useState(false);
  const[recuperarEmail,setRecuperarEmail]=useState("");
  const[recuperarLoading,setRecuperarLoading]=useState(false);
  const[recuperarErro,setRecuperarErro]=useState("");
  const[recuperarOk,setRecuperarOk]=useState(false);
  const[semContaGoogle,setSemContaGoogle]=useState(false);

  useEffect(()=>{
    const session=readOfflineCache(AUTH_KEYS.session);
    if(session?.remember&&session?.email){
      setEmail(session.email);
      setRememberMe(true);
    }
    if(readOfflineCache(AUTH_KEYS.googleSemConta)){
      try{localStorage.removeItem(AUTH_KEYS.googleSemConta);}catch{/* ignore */}
      setSemContaGoogle(true);
    }
  },[]);

  const persistRememberEmail=()=>{
    if(rememberMe){
      writeOfflineCache(AUTH_KEYS.session,{remember:true,email});
    }else{
      try{localStorage.removeItem(AUTH_KEYS.session);}catch{/* ignore */}
    }
  };

  const go=async()=>{
    setLoading(true);
    setErro("");
    try{
      await signInWithEmail(email,pass);
      persistRememberEmail();
    }catch(e){
      setErro(getAuthErrorMessage(e?.code));
    }finally{
      setLoading(false);
    }
  };

  const marcarSemContaGoogle=()=>{
    writeOfflineCache(AUTH_KEYS.googleSemConta,true);
    setSemContaGoogle(true);
  };

  const loginGoogle=async()=>{
    setLoading(true);
    setErro("");
    setSemContaGoogle(false);
    try{
      const cred=await signInWithGoogle();
      const profile=await loadUserProfile(cred.user.uid);
      if(!profile){
        marcarSemContaGoogle();
        await signOutUser();
        return;
      }
      if(rememberMe&&cred.user.email){
        writeOfflineCache(AUTH_KEYS.session,{remember:true,email:cred.user.email});
      }
    }catch(e){
      if(e?.code!=="auth/popup-closed-by-user"&&e?.code!=="auth/cancelled-popup-request"){
        setErro(getAuthErrorMessage(e?.code));
      }
    }finally{
      setLoading(false);
    }
  };

  const abrirRecuperar=()=>{
    setRecuperarErro("");
    setRecuperarOk(false);
    setRecuperarEmail(email.trim());
    setShowRecuperar(true);
  };

  const fecharRecuperar=()=>{
    setShowRecuperar(false);
    setRecuperarErro("");
    setRecuperarOk(false);
    setRecuperarLoading(false);
  };

  const enviarResetSenha=async()=>{
    const alvo=(recuperarEmail||email).trim();
    if(!alvo){
      setRecuperarErro("Digite seu e-mail para receber o link de redefinição.");
      return;
    }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)){
      setRecuperarErro("E-mail inválido. Verifique e tente novamente.");
      return;
    }
    setRecuperarLoading(true);
    setRecuperarErro("");
    setRecuperarOk(false);
    try{
      await sendPasswordResetEmail(alvo);
      setRecuperarOk(true);
    }catch(e){
      setRecuperarErro(getPasswordResetErrorMessage(e?.code));
    }finally{
      setRecuperarLoading(false);
    }
  };

  const azul="#1E3A8A";
  const azulMid="#2952C8";
  const azulCard="#2A4AB5";

  return(
    <div style={{background:`linear-gradient(160deg,${azul} 0%,${azulMid} 100%)`,minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",overflowY:"auto"}}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>

      {/* Faixa laranja no topo */}
      <div style={{height:3,background:`linear-gradient(90deg,transparent,${C.orange},transparent)`}}/>

      {/* Hero */}
      <div style={{padding:"44px 28px 32px",textAlign:"center"}}>

        {/* Logo sem anel — maior e limpo */}
        <div style={{display:"flex",justifyContent:"center",marginBottom:16}}>
          <div style={{borderRadius:20,border:"3px solid #EFEFED",boxShadow:"0 4px 20px #00000033",background:"#EFEFED",overflow:"hidden",width:120,height:120,display:"flex",alignItems:"center",justifyContent:"center",padding:6}}>
            <img src="/logo.png" alt="LogRotas" style={{width:"100%",height:"100%",objectFit:"contain",borderRadius:12}}/>
          </div>
        </div>

        <div style={{display:"flex",justifyContent:"center",alignItems:"baseline",marginBottom:10}}>
          <span style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:40,color:"#fff",letterSpacing:-1}}>Log</span>
          <span style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:40,color:C.orange,letterSpacing:-1}}>Rotas</span>
        </div>

        <div style={{color:"#93C5FD",fontSize:15,lineHeight:1.6,maxWidth:280,margin:"0 auto"}}>
          Calcule, planeje e gerencie suas rotas com precisão
        </div>
      </div>

      {/* Card formulário — branco flutuando sobre azul */}
      <div style={{margin:"0 16px 40px",background:"#fff",borderRadius:24,padding:"28px 22px",border:`1.5px solid ${C.orange}33`,boxShadow:`0 12px 40px #00000044, 0 0 0 1px ${C.orange}18`}}>

        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{color:"#0F1E2E",fontWeight:800,fontSize:21,fontFamily:"'Sora',sans-serif",marginBottom:4}}>Bem-vindo de volta</div>
          <div style={{color:"#94A3B8",fontSize:14}}>Entre na sua conta para continuar</div>
        </div>

        {/* Campo e-mail */}
        <div style={{marginBottom:16}}>
          <div style={{color:"#64748B",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>E-mail</div>
          <div style={{background:"#F8FAFC",border:`1.5px solid ${C.orange}44`,borderRadius:14,display:"flex",alignItems:"center",boxShadow:"0 1px 4px #00000008",transition:"border .15s"}}
            onFocusCapture={e=>e.currentTarget.style.borderColor=C.orange}
            onBlurCapture={e=>e.currentTarget.style.borderColor=`${C.orange}44`}>
            <MailIcon size={15} color={C.orange} style={{marginLeft:14,flexShrink:0}}/>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="seu@email.com"
              style={{flex:1,background:"transparent",border:"none",outline:"none",padding:"13px 14px",fontSize:14,color:"#1E293B",fontFamily:"'DM Sans',sans-serif"}}/>
          </div>
        </div>

        {/* Campo senha */}
        <div style={{marginBottom:10}}>
          <div style={{color:"#64748B",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>Senha</div>
          <div style={{background:"#F8FAFC",border:`1.5px solid ${C.orange}44`,borderRadius:14,display:"flex",alignItems:"center",boxShadow:"0 1px 4px #00000008",transition:"border .15s"}}
            onFocusCapture={e=>e.currentTarget.style.borderColor=C.orange}
            onBlurCapture={e=>e.currentTarget.style.borderColor=`${C.orange}44`}>
            <LockIcon size={15} color={C.orange} style={{marginLeft:14,flexShrink:0}}/>
            <input value={pass} onChange={e=>setPass(e.target.value)} type={show?"text":"password"} placeholder="••••••••"
              style={{flex:1,background:"transparent",border:"none",outline:"none",padding:"13px 14px",fontSize:14,color:"#1E293B",fontFamily:"'DM Sans',sans-serif",minWidth:0}}/>
            <button onClick={()=>setShow(s=>!s)}
              style={{background:"none",border:"none",cursor:"pointer",color:"#94A3B8",display:"flex",alignItems:"center",justifyContent:"center",width:44,height:44,flexShrink:0,marginRight:4}}>
              {show?<EyeOffIcon size={16}/>:<EyeIcon size={16}/>}
            </button>
          </div>
        </div>

        <label style={{display:"flex",alignItems:"center",gap:9,marginBottom:14,cursor:"pointer",userSelect:"none"}}>
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={e=>setRememberMe(e.target.checked)}
            style={{width:17,height:17,accentColor:C.orange,cursor:"pointer"}}
          />
          <span style={{color:"#64748B",fontSize:13,fontWeight:600}}>Lembrar de mim</span>
        </label>

        <div style={{textAlign:"right",marginBottom:22}}>
          <span onClick={abrirRecuperar} style={{color:C.orange,fontSize:12,fontWeight:600,cursor:"pointer"}}>Esqueci minha senha</span>
        </div>

        {/* Modal recuperar senha */}
        {showRecuperar&&(
          <div style={{position:"fixed",inset:0,background:"#00000066",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
            <div style={{background:"#fff",borderRadius:22,width:"100%",maxWidth:360,padding:26,boxShadow:"0 20px 60px #00000033"}}>
              <div style={{textAlign:"center",marginBottom:20}}>
                <div style={{fontSize:36,marginBottom:8}}>🔐</div>
                <div style={{color:"#0F1E2E",fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif",marginBottom:6}}>Recuperar senha</div>
                <div style={{color:"#94A3B8",fontSize:14,lineHeight:1.5}}>
                  {recuperarOk
                    ? "Verifique sua caixa de entrada e o spam."
                    : "Enviaremos um link para redefinir sua senha"}
                </div>
              </div>

              {recuperarOk?(
                <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:14,padding:"14px 16px",marginBottom:16,color:"#15803D",fontSize:14,fontWeight:600,lineHeight:1.5,textAlign:"center"}}>
                  Enviamos um link de redefinição para seu e-mail
                </div>
              ):(
                <>
                  {!email.trim()&&(
                    <div style={{marginBottom:14}}>
                      <div style={{color:"#64748B",fontSize:10,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:7}}>E-mail</div>
                      <div style={{background:"#F8FAFC",border:"1.5px solid #BFDBFE",borderRadius:14,display:"flex",alignItems:"center"}}>
                        <MailIcon size={15} color="#3B82F6" style={{marginLeft:14,flexShrink:0}}/>
                        <input
                          value={recuperarEmail}
                          onChange={e=>{setRecuperarEmail(e.target.value);setRecuperarErro("");}}
                          type="email"
                          placeholder="seu@email.com"
                          style={{flex:1,background:"transparent",border:"none",outline:"none",padding:"13px 14px",fontSize:14,color:"#1E293B",fontFamily:"'DM Sans',sans-serif"}}
                        />
                      </div>
                    </div>
                  )}
                  {email.trim()&&(
                    <div style={{display:"flex",alignItems:"center",gap:14,background:"#EFF6FF",border:"1.5px solid #BFDBFE",borderRadius:14,padding:"14px 16px",marginBottom:14}}>
                      <div style={{width:42,height:42,borderRadius:"50%",background:"#3B82F6",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <MailIcon size={18} color="#fff"/>
                      </div>
                      <div style={{minWidth:0}}>
                        <div style={{color:"#1D4ED8",fontWeight:700,fontSize:14}}>Recuperar por e-mail</div>
                        <div style={{color:"#64748B",fontSize:12,marginTop:2,wordBreak:"break-all"}}>{email.trim()}</div>
                      </div>
                    </div>
                  )}
                  {recuperarErro&&(
                    <div style={{background:C.redLight,border:`1px solid ${C.red}33`,borderRadius:10,padding:"10px 13px",marginBottom:14,color:C.red,fontSize:13,fontWeight:600}}>
                      {recuperarErro}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={enviarResetSenha}
                    disabled={recuperarLoading}
                    style={{width:"100%",padding:"14px 16px",marginBottom:12,background:recuperarLoading?"#93C5FD":"#3B82F6",border:"none",borderRadius:14,cursor:recuperarLoading?"wait":"pointer",color:"#fff",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                    <MailIcon size={16} color="#fff"/>
                    {recuperarLoading?"Enviando...":"Recuperar por e-mail"}
                  </button>
                </>
              )}

              <button type="button" onClick={fecharRecuperar}
                style={{width:"100%",padding:"13px",background:"#F8FAFC",border:"1.5px solid #E2E8F0",borderRadius:12,cursor:"pointer",color:"#64748B",fontWeight:600,fontSize:14}}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {erro&&<div style={{background:C.redLight,border:`1px solid ${C.red}33`,borderRadius:10,padding:"10px 13px",marginBottom:14,color:C.red,fontSize:13,fontWeight:600}}>{erro}</div>}

        {semContaGoogle&&(
          <div style={{background:"#FFF8F4",border:`1px solid ${C.orange}44`,borderRadius:10,padding:"10px 13px",marginBottom:14,color:"#64748B",fontSize:13,lineHeight:1.55,textAlign:"center"}}>
            Você ainda não tem conta. Crie gratuitamente em{" "}
            <a href="https://logrotas.com.br/cadastro" target="_blank" rel="noopener noreferrer" style={{color:C.orange,fontWeight:600,textDecoration:"underline",textUnderlineOffset:2}}>logrotas.com.br</a>
          </div>
        )}

        {/* Botão Entrar */}
        <button onClick={go} disabled={!email||!pass||loading}
          style={{width:"100%",padding:"15px",background:!email||!pass||loading?"#F1F5F9":`linear-gradient(135deg,${C.orange},#FF9800)`,border:`1.5px solid ${!email||!pass||loading?"#E2E8F0":C.orange}`,borderRadius:14,cursor:!email||!pass||loading?"not-allowed":"pointer",color:!email||!pass||loading?"#B0BEC5":"#fff",fontWeight:700,fontSize:15,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:!email||!pass||loading?"none":`0 6px 20px ${C.orange}44`,transition:"all .2s"}}>
          {loading?"Entrando...":<><span>Entrar</span><ArrowRightIcon size={15}/></>}
        </button>

        <div style={{display:"flex",alignItems:"center",gap:10,marginTop:16,marginBottom:16}}>
          <div style={{flex:1,height:1,background:"#F0F4F8"}}/>
          <span style={{color:"#B0BEC5",fontSize:12}}>ou</span>
          <div style={{flex:1,height:1,background:"#F0F4F8"}}/>
        </div>

        <button type="button" onClick={loginGoogle} disabled={loading}
          style={{width:"100%",padding:"13px",background:"#fff",border:`1.5px solid ${C.orange}33`,borderRadius:14,cursor:loading?"not-allowed":"pointer",color:"#334155",fontWeight:600,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:7,boxShadow:"0 1px 4px #00000008",opacity:loading?0.6:1,marginBottom:16}}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Entrar com Google
        </button>

        <p style={{marginTop:0,marginBottom:0,textAlign:"center",color:"#94A3B8",fontSize:13,lineHeight:1.55}}>
          Ainda não tem conta? Crie gratuitamente em{" "}
          <a href="https://logrotas.com.br/cadastro" target="_blank" rel="noopener noreferrer" style={{color:C.orange,fontWeight:600,textDecoration:"underline",textUnderlineOffset:2}}>logrotas.com.br</a>
        </p>
      </div>
    </div>
  );
};

// ── AVALIAÇÃO DO APP (estrelas) ───────────────────────────────────────────────
const AvaliacaoAppModal=({open,origem,perfil,uid,onDispensar,onEnviado,onFalhaEnvio})=>{
  const[nota,setNota]=useState(0);
  const[hover,setHover]=useState(0);
  const[comentario,setComentario]=useState("");
  const[enviando,setEnviando]=useState(false);
  const[erro,setErro]=useState("");

  useEffect(()=>{
    if(open){
      setNota(0);
      setHover(0);
      setComentario("");
      setErro("");
      setEnviando(false);
    }
  },[open]);

  if(!open)return null;

  const notaAtiva=hover||nota;
  const notaBaixa=nota>=1&&nota<=3;

  const handleEnviar=async()=>{
    if(nota<1){setErro("Selecione uma nota de 1 a 5 estrelas.");return;}
    if(!uid){setErro("Faça login para enviar sua avaliação.");return;}
    setEnviando(true);
    setErro("");
    try{
      await enviarAvaliacao(uid,{nota,comentario,calculadora:origem,perfil});
      onEnviado?.();
    }catch(err){
      console.error("[Avaliacao] Erro no envio pelo modal:",err);
      setErro("Não foi possível enviar. Tente novamente.");
      onFalhaEnvio?.(origem);
    }finally{
      setEnviando(false);
    }
  };

  return(
    <div style={{position:"fixed",inset:0,background:"#1E3A8A55",zIndex:950,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>!enviando&&onDispensar?.()}>
      <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:380,padding:24,boxShadow:"0 12px 40px #00000028",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:32,marginBottom:8}}>⭐</div>
        <div style={{color:C.navy,fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif",marginBottom:6,lineHeight:1.35}}>
          Como está sua experiência com o LogRotas?
        </div>
        <div style={{color:C.muted,fontSize:13,marginBottom:18,lineHeight:1.45}}>
          Sua opinião nos ajuda a melhorar o app para motoristas como você.
        </div>
        <div style={{display:"flex",justifyContent:"center",gap:8,marginBottom:18}} onMouseLeave={()=>setHover(0)}>
          {[1,2,3,4,5].map(n=>(
            <button
              key={n}
              type="button"
              onMouseEnter={()=>setHover(n)}
              onClick={()=>setNota(n)}
              style={{background:"transparent",border:"none",cursor:"pointer",padding:4,lineHeight:0}}
              aria-label={`${n} estrela${n!==1?"s":""}`}
            >
              <StarIcon
                size={34}
                color={n<=notaAtiva?"#F59E0B":"#CBD5E1"}
                fill={n<=notaAtiva?"#F59E0B":"none"}
                strokeWidth={n<=notaAtiva?1.5:2}
              />
            </button>
          ))}
        </div>
        <div style={{textAlign:"left",marginBottom:16}}>
          <label style={{display:"block",color:notaBaixa?C.navy:C.muted,fontWeight:notaBaixa?700:600,fontSize:notaBaixa?13:12,marginBottom:6}}>
            {notaBaixa?"O que podemos melhorar?":"Comentário (opcional)"}
          </label>
          <textarea
            value={comentario}
            onChange={e=>setComentario(e.target.value)}
            placeholder={notaBaixa?"Conte o que não funcionou bem para você…":"Alguma sugestão ou elogio?"}
            rows={3}
            style={{
              width:"100%",
              boxSizing:"border-box",
              background:notaBaixa?"#FFFBEB":C.card,
              border:`1.5px solid ${notaBaixa?"#FCD34D":C.border}`,
              borderRadius:12,
              padding:"10px 12px",
              fontSize:14,
              color:C.text,
              resize:"vertical",
              outline:"none",
              fontFamily:"inherit",
            }}
          />
        </div>
        {erro&&<div style={{color:C.red,fontSize:12,marginBottom:12,textAlign:"center"}}>{erro}</div>}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <button
            type="button"
            onClick={handleEnviar}
            disabled={enviando}
            style={{width:"100%",padding:13,background:C.navy,border:"none",borderRadius:12,cursor:enviando?"default":"pointer",color:"#fff",fontWeight:700,fontSize:14,opacity:enviando?0.7:1}}
          >
            {enviando?"Enviando…":"Enviar"}
          </button>
          <button
            type="button"
            onClick={()=>!enviando&&onDispensar?.()}
            disabled={enviando}
            style={{width:"100%",padding:12,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,cursor:enviando?"default":"pointer",color:C.text2,fontWeight:600,fontSize:14}}
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
};

// ── SELETOR DE CALCULADORA ────────────────────────────────────────────────────
const CalcSelector=({onFrete,onViagem,onOtimizar,onClose})=>(
  <ModalWrap maxW={480}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
      <div>
        <div style={{color:C.navy,fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif"}}>O que deseja calcular?</div>
        <div style={{color:C.muted,fontSize:12,marginTop:2}}>Escolha o tipo de cálculo</div>
      </div>
      <button onClick={onClose} style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:10,padding:8,cursor:"pointer",color:C.muted,display:"flex"}}><XIcon size={15}/></button>
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {/* Viagem */}
      <button onClick={onViagem} style={{background:"#F0F6FF",border:"1.5px solid #BFDBFE",borderRadius:18,padding:"18px 16px",cursor:"pointer",textAlign:"left",boxShadow:"0 2px 8px #3B82F60E"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#3B82F6,#2563EB)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 3px 10px #3B82F633"}}>
            <span style={{fontSize:22}}>🚗</span>
          </div>
          <div style={{flex:1}}>
            <div style={{color:"#1E3A8A",fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif"}}>Calculadora de Viagem</div>
            <div style={{color:"#64748B",fontSize:12,marginTop:2}}>Consulta rápida do custo da sua viagem</div>
          </div>
          <ArrowRightIcon size={15} color="#3B82F6"/>
        </div>
        <div style={{display:"flex",gap:6}}>
          {[{emoji:"⛽",txt:"Combustível"},{emoji:"🏁",txt:"Pedágio"},{emoji:"💸",txt:"Custo total"}].map((t,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"#fff",border:"1px solid #BFDBFE",borderRadius:8,padding:"4px 10px"}}>
              <span style={{fontSize:11}}>{t.emoji}</span>
              <span style={{color:"#1D4ED8",fontSize:11,fontWeight:600}}>{t.txt}</span>
            </div>
          ))}
        </div>
      </button>

      {/* Frete */}
      <button onClick={onFrete} style={{background:"#FFF7F0",border:`1.5px solid ${C.orange}44`,borderRadius:18,padding:"18px 16px",cursor:"pointer",textAlign:"left",boxShadow:`0 2px 8px ${C.orange}0E`}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${C.orange},#FF9800)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 3px 10px ${C.orange}33`}}>
            <span style={{fontSize:22}}>🚛</span>
          </div>
          <div style={{flex:1}}>
            <div style={{color:C.navy,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif"}}>Calculadora de Rotas + Frete</div>
            <div style={{color:"#64748B",fontSize:12,marginTop:2}}>Calcule, salve e compartilhe seu orçamento</div>
          </div>
          <ArrowRightIcon size={15} color={C.orange}/>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{emoji:"💰",txt:"Frete"},{emoji:"📊",txt:"Lucro"},{emoji:"📲",txt:"WhatsApp"},{emoji:"💾",txt:"Histórico"}].map((t,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"#fff",border:`1px solid ${C.orange}33`,borderRadius:8,padding:"4px 10px"}}>
              <span style={{fontSize:11}}>{t.emoji}</span>
              <span style={{color:C.orange,fontSize:11,fontWeight:600}}>{t.txt}</span>
            </div>
          ))}
        </div>
      </button>

      {/* Otimizar Entregas — V147 */}
      <button onClick={onOtimizar} style={{background:"linear-gradient(135deg,#F0FDF4,#DCFCE7)",border:"1.5px solid #86EFAC",borderRadius:18,padding:"18px 16px",cursor:"pointer",textAlign:"left",boxShadow:"0 2px 8px #22C55E0E",position:"relative",overflow:"hidden"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#22C55E,#16A34A)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 3px 10px #22C55E33"}}>
            <span style={{fontSize:22}}>📦</span>
          </div>
          <div style={{flex:1}}>
            <div style={{color:"#14532D",fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif"}}>Otimizar Entregas</div>
            <div style={{color:"#64748B",fontSize:12,marginTop:2}}>Rota perfeita para múltiplas paradas</div>
          </div>
          <ArrowRightIcon size={15} color="#22C55E"/>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[{emoji:"📷",txt:"Romaneio"},{emoji:"⚡",txt:"Otimizar"},{emoji:"💰",txt:"Economia"}].map((t,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"#fff",border:"1px solid #86EFAC",borderRadius:8,padding:"4px 10px"}}>
              <span style={{fontSize:11}}>{t.emoji}</span>
              <span style={{color:"#16A34A",fontSize:11,fontWeight:600}}>{t.txt}</span>
            </div>
          ))}
        </div>
      </button>
    </div>
  </ModalWrap>
);

// ── OTIMIZAR ENTREGAS (V166 — origem GPS do motorista na otimização) ───────────
const OTIMIZAR_AZUL="#3B82F6";
const OTIMIZAR_AZUL_MID="#2563EB";
const OTIMIZAR_LARANJA="#ED6A2C";
const MOTIVOS_NAO_ENTREGUE=["Cliente ausente","Cliente recusou","Endereço não encontrado","Outro"];

function paradaBolinhaCor(p,i,paradaAtualIdx,modoNavegacao){
  const st=getParadaStatus(p);
  if(st==="concluida"||st==="entregue")return C.green;
  if(st==="nao_entregue")return C.red;
  if(modoNavegacao&&i===paradaAtualIdx&&st==="pendente")return OTIMIZAR_AZUL;
  if(p.confianca==="warn"&&st==="pendente")return "#F59E0B";
  return OTIMIZAR_AZUL;
}

function paradaCardBg(p){
  const st=getParadaStatus(p);
  if(st==="concluida"||st==="entregue")return "#F0FDF4";
  if(st==="nao_entregue")return "#FFF5F5";
  if(p.confianca==="warn")return "#FFFBEB";
  return C.subtle;
}

function paradaCardBorder(p,i,paradaAtualIdx,modoNavegacao){
  const st=getParadaStatus(p);
  if(modoNavegacao&&i===paradaAtualIdx&&st==="pendente")return OTIMIZAR_AZUL;
  if(st==="concluida"||st==="entregue")return `${C.green}44`;
  if(st==="nao_entregue")return `${C.red}44`;
  if(p.confianca==="warn")return "#FDE68A";
  return C.border;
}

function PacotesParadaRows({parada,paradaId,onEntregue,onNaoEntregue,compact=false}){
  const m=migrateParada(parada);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:compact?6:8,marginTop:compact?6:10}}>
      {(m.pacotes||[]).map((pk,i)=>(
        <div key={pk.id} style={{
          padding:compact?"8px 10px":"10px 12px",
          background:"#fff",
          border:`1px solid ${C.border}`,
          borderRadius:9,
        }}>
          <div style={{color:C.text,fontWeight:700,fontSize:compact?12:13,marginBottom:pk.status==="pendente"?6:4}}>
            📦 {pacoteDisplayName(pk,i)}
          </div>
          {pk.status==="entregue"&&<div style={{color:C.green,fontSize:11,fontWeight:700}}>✅ Entregue</div>}
          {pk.status==="nao_entregue"&&(
            <div style={{color:C.red,fontSize:11,fontWeight:700}}>❌ {pk.motivoNaoEntrega||"Não entregue"}</div>
          )}
          {pk.status==="pendente"&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              <button type="button" onClick={()=>onEntregue(paradaId,pk.id)}
                style={{padding:"8px 6px",background:"#DCFCE7",border:"2px solid #22C55E",borderRadius:10,cursor:"pointer",color:"#15803D",fontWeight:800,fontSize:12}}>
                ✅ Entregue
              </button>
              <button type="button" onClick={()=>onNaoEntregue(paradaId,pk.id)}
                style={{padding:"8px 6px",background:"#FEE2E2",border:"2px solid #DC2626",borderRadius:10,cursor:"pointer",color:"#B91C1C",fontWeight:800,fontSize:12}}>
                ❌ Não
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** V257/V258 — tela cheia dedicada; lê paradaViva do estado canônico (não snapshot). */
function PacotesParadaTela({paradaViva,paradaNum,paradaId,onVoltar,onEntregue,onNaoEntregue}){
  const m=paradaViva?migrateParada(paradaViva):null;
  if(!m)return null;
  const st=getParadaStatus(m);
  const concluida=st==="concluida"||st==="entregue";

  return(
    <div style={{position:"fixed",inset:0,zIndex:790,background:"#fff",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,background:"#fff",flexShrink:0}}>
        <button type="button" onClick={onVoltar} aria-label="Voltar"
          style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:9,padding:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <ArrowLeftIcon size={18} color={C.navy}/>
        </button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.navy,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif"}}>Parada {paradaNum}</div>
          <div style={{color:C.muted,fontSize:11,marginTop:2}}>📦 {resumoPacotesLabel(m)}</div>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 16px",paddingBottom:"max(20px, env(safe-area-inset-bottom))"}}>
        <div style={{
          padding:"14px 16px",marginBottom:14,borderRadius:12,
          background:concluida?"#F0FDF4":C.subtle,
          border:`1.5px solid ${concluida?`${C.green}44`:C.border}`,
        }}>
          <div style={{color:C.text,fontSize:14,fontWeight:600,lineHeight:1.45}}>{m.endereco}</div>
          <div style={{color:concluida?C.green:OTIMIZAR_AZUL,fontSize:12,fontWeight:700,marginTop:8}}>
            📦 {resumoPacotesLabel(m)}
          </div>
          {concluida&&<div style={{color:C.green,fontSize:12,fontWeight:700,marginTop:6}}>✅ Parada concluída{m.horario?` · ${m.horario}`:""}</div>}
        </div>
        <PacotesParadaRows
          parada={m}
          paradaId={paradaId}
          onEntregue={(pid,pkid)=>onEntregue(pid,pkid,"entregue")}
          onNaoEntregue={onNaoEntregue}
        />
      </div>
    </div>
  );
}

function formatNowBR(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  return {
    horario:`${pad(d.getHours())}:${pad(d.getMinutes())}`,
    data:`${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`,
  };
}

const HistoricoEntregasScreen=({
  onBack,
  uid,
  rotas,
  onReload,
  abertoId,
  setAbertoId,
  onGerarPdf,
  gerandoPdf,
  reportFromHistorico,
})=>{
  const[confirmApagar,setConfirmApagar]=useState(null);
  const[apagando,setApagando]=useState(false);
  const[erroApagar,setErroApagar]=useState("");

  const handleApagar=async()=>{
    if(!confirmApagar||!uid)return;
    setApagando(true);
    setErroApagar("");
    try{
      await deleteDeliveryRoute(uid,confirmApagar);
      setConfirmApagar(null);
      if(abertoId===confirmApagar)setAbertoId(null);
      await onReload?.();
    }catch{
      setErroApagar("Não foi possível apagar o registro.");
    }finally{
      setApagando(false);
    }
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:750,background:C.surface,display:"flex",flexDirection:"column"}}>
      <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:12,background:"#fff",flexShrink:0}}>
        <button type="button" onClick={onBack} aria-label="Voltar"
          style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:9,padding:8,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <ArrowLeftIcon size={18} color={C.navy}/>
        </button>
        <div style={{color:C.navy,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif"}}>📋 Histórico de Entregas</div>
      </div>

      <div style={{flex:1,overflowY:"auto",padding:"14px 16px",paddingBottom:"max(16px, env(safe-area-inset-bottom))"}}>
        {erroApagar&&(
          <div style={{background:"#FFF5F5",border:"1px solid #FCA5A5",borderRadius:10,padding:"10px 12px",marginBottom:12,color:C.red,fontSize:12,fontWeight:600}}>
            {erroApagar}
          </div>
        )}
        {!uid&&(
          <div style={{background:C.subtle,border:`1px dashed ${C.border}`,borderRadius:11,padding:"14px",color:C.muted,fontSize:12,textAlign:"center"}}>
            Faça login para ver rotas anteriores.
          </div>
        )}
        {uid&&rotas.length===0&&(
          <div style={{textAlign:"center",padding:"48px 20px",color:C.muted}}>
            <div style={{fontSize:40,marginBottom:12}}>📋</div>
            <div style={{fontSize:14,fontWeight:600}}>Nenhuma entrega registrada ainda</div>
          </div>
        )}
        {uid&&rotas.length>0&&(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {rotas.map(r=>{
              const aberto=abertoId===r.id;
              return(
                <div key={r.id} style={{background:C.subtle,border:`1px solid ${aberto?OTIMIZAR_AZUL:C.border}`,borderRadius:11,overflow:"hidden"}}>
                  <button type="button" onClick={()=>setAbertoId(aberto?null:r.id)}
                    style={{width:"100%",textAlign:"left",background:"transparent",border:"none",padding:"12px 14px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:C.text,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif",lineHeight:1.35}}>{r.date||"—"}{r.hora?` · ${r.hora}`:""} · {r.totalParadas||0} paradas</div>
                      <div style={{color:C.muted,fontSize:12,marginTop:3}}>
                        ✅ {r.entregues||0} entregues · ❌ {r.naoEntregues||0} não entregues
                        {r.synced===false&&<span style={{color:C.amber,marginLeft:6}}>· só no dispositivo</span>}
                      </div>
                    </div>
                    <span style={{color:OTIMIZAR_AZUL,fontSize:12,fontWeight:800,flexShrink:0}}>{aberto?"▼":"▶"}</span>
                  </button>
                  {aberto&&(
                    <div style={{padding:"0 14px 14px",borderTop:`1px solid ${C.border}`}}>
                      <button type="button" disabled={gerandoPdf} onClick={()=>onGerarPdf?.(reportFromHistorico(r))}
                        style={{width:"100%",padding:11,marginTop:12,background:"#fff",border:`1.5px solid ${OTIMIZAR_AZUL}`,borderRadius:10,cursor:gerandoPdf?"wait":"pointer",color:OTIMIZAR_AZUL,fontWeight:700,fontSize:13}}>
                        📄 {gerandoPdf?"Gerando PDF…":"Gerar PDF"}
                      </button>
                      <button type="button" disabled={apagando} onClick={()=>setConfirmApagar(r.id)}
                        style={{width:"100%",padding:12,marginTop:8,background:"#FCA5A5",border:"none",borderRadius:10,cursor:apagando?"wait":"pointer",color:"#991B1B",fontWeight:700,fontSize:13}}>
                        🗑️ Apagar este registro
                      </button>
                      {(r.paradas||[]).map((p,i)=>(
                        <div key={i} style={{padding:"10px 0",borderBottom:i<(r.paradas?.length||0)-1?`1px solid ${C.border}`:"none"}}>
                          <div style={{color:C.text,fontSize:13,fontWeight:600}}>{i+1}. {p.endereco}</div>
                          {Array.isArray(p.pacotes)&&p.pacotes.length>0?(
                            p.pacotes.map((pk,j)=>(
                              <div key={pk.id||j} style={{fontSize:12,color:pk.status==="entregue"?"#15803D":"#DC2626",fontWeight:700,marginTop:4}}>
                                • {(pk.nome||"").trim()||`Pacote ${j+1}`}: {pk.status==="entregue"?"✅ Entregue":`❌ Não entregue${pk.motivoNaoEntrega?` — ${pk.motivoNaoEntrega}`:""}`}
                              </div>
                            ))
                          ):(
                          <div style={{
                            color:p.status==="entregue"||p.status==="concluida"?"#15803D":"#DC2626",
                            fontSize:13,
                            fontWeight:700,
                            marginTop:4,
                          }}>
                            {p.status==="entregue"||p.status==="concluida"?"✅ Entregue":`❌ Não entregue${p.motivo?` — ${p.motivo}`:""}`}
                            {p.horario?<span style={{fontWeight:600,color:C.muted}}>{` · ${p.horario}`}</span>:""}
                          </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmApagar&&(
        <div style={{position:"fixed",inset:0,zIndex:800,background:"#1E3A8A66",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:340,padding:24,boxShadow:"0 12px 40px #00000033",textAlign:"center"}}>
            <div style={{color:C.navy,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif",marginBottom:18,lineHeight:1.5}}>
              Tem certeza que deseja apagar este registro?
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button type="button" disabled={apagando} onClick={handleApagar}
                style={{width:"100%",padding:13,background:"#FCA5A5",border:"none",borderRadius:12,cursor:apagando?"wait":"pointer",color:"#991B1B",fontWeight:700,fontSize:14}}>
                {apagando?"Apagando…":"Apagar"}
              </button>
              <button type="button" disabled={apagando} onClick={()=>setConfirmApagar(null)}
                style={{width:"100%",padding:13,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:14}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// V290 — maior número de pacote (numérico) já usado na rota — base para a sequência automática
function maxNumeroPacoteSeq(lista){
  let mx=0;
  for(const p of (lista||[])){
    for(const pk of (migrateParada(p).pacotes||[])){
      const n=parseInt(String(pk.numero||"").trim(),10);
      if(Number.isFinite(n)&&n>mx)mx=n;
    }
  }
  return mx;
}

// V289 — formulário compartilhado de endereço + pacotes (form principal e "Adicionar parada" na navegação)
const EnderecoPacotesForm=({
  endereco,setEndereco,
  destinatario,setDestinatario,
  pacoteNum,setPacoteNum,
  extrasNomes,setExtrasNomes,
  extrasNums,setExtrasNums,
  onSubmit,submitLabel="Adicionar",submitting=false,disabled=false,
  addressPlaceholder="Ex.: Rua das Flores, 100 - Centro",onErro,
})=>{
  const inputStyle={flex:1,minWidth:0,background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:"10px 12px",fontSize:14,outline:"none",boxSizing:"border-box"};
  const numStyle={...inputStyle,flex:"none",width:96,flexShrink:0};
  const addExtra=()=>{setExtrasNomes(arr=>[...arr,""]);setExtrasNums(arr=>[...arr,""]);};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div onKeyDown={e=>{if(e.key==="Enter"&&!submitting&&!disabled)onSubmit();}}>
        <AddressInput
          value={endereco}
          onChange={v=>{if(!disabled){setEndereco(v);onErro?.("");}}}
          onSelect={s=>{if(!disabled){setEndereco(s.label);onErro?.("");}}}
          placeholder={addressPlaceholder}
          dotColor={OTIMIZAR_AZUL}
          enableVoice
          disabled={disabled||submitting}
        />
      </div>
      <div style={{display:"flex",gap:8}}>
        <input type="text" value={destinatario} onChange={e=>setDestinatario(e.target.value)} placeholder="Nome do destinatário (opcional)" autoComplete="off" disabled={disabled||submitting} style={inputStyle}/>
        <input type="text" value={pacoteNum} onChange={e=>setPacoteNum(e.target.value)} placeholder="Nº pacote" autoComplete="off" inputMode="numeric" disabled={disabled||submitting} style={numStyle}/>
      </div>
      {extrasNomes.map((nome,idx)=>(
        <div key={idx} style={{display:"flex",gap:8}}>
          <input type="text" value={nome} onChange={e=>setExtrasNomes(arr=>arr.map((v,i)=>i===idx?e.target.value:v))} placeholder={`Destinatário — pacote ${idx+2} (opcional)`} autoComplete="off" disabled={disabled||submitting} style={inputStyle}/>
          <input type="text" value={extrasNums[idx]||""} onChange={e=>setExtrasNums(arr=>{const next=[...arr];next[idx]=e.target.value;return next;})} placeholder="Nº pacote" autoComplete="off" inputMode="numeric" disabled={disabled||submitting} style={numStyle}/>
        </div>
      ))}
      <button onClick={onSubmit} disabled={disabled||submitting}
        style={{width:"100%",background:disabled||submitting?"#94A3B8":OTIMIZAR_AZUL,border:"none",borderRadius:12,padding:"12px 20px",cursor:disabled||submitting?"not-allowed":"pointer",color:"#fff",fontWeight:800,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:7,minHeight:48,boxShadow:disabled||submitting?"none":`0 4px 14px ${OTIMIZAR_AZUL}44`}}>
        <PlusIcon size={18}/> {submitting?"…":submitLabel}
      </button>
      {!disabled&&(
        <button type="button" onClick={addExtra} disabled={submitting}
          style={{width:"100%",padding:"10px 12px",background:"#fff",border:`1.5px dashed ${OTIMIZAR_AZUL}`,borderRadius:10,cursor:"pointer",color:OTIMIZAR_AZUL,fontWeight:700,fontSize:13}}>
          + Adicionar outro pacote neste endereço
        </button>
      )}
    </div>
  );
};

const OtimizarEntregasModal=({onClose,perfil,plan,uid,resumeNavigation=false,onNavigationResumed,onConcluido})=>{
  const[paradas,setParadas]=useState([]);
  const[novoEndereco,setNovoEndereco]=useState("");
  const[processandoFoto,setProcessandoFoto]=useState(false);
  // V235 — overlay de progresso (otimização e importação); flow define onde cai o aviso de timeout
  const[overlayMsg,setOverlayMsg]=useState("");
  const overlayFlowRef=useRef("otimizar");
  const[erroFoto,setErroFoto]=useState("");
  const[avisoScanFalha,setAvisoScanFalha]=useState("");
  const[erroManual,setErroManual]=useState("");
  const[adicionandoManual,setAdicionandoManual]=useState(false);
  const[otimizando,setOtimizando]=useState(false);
  const[erroOtimizar,setErroOtimizar]=useState("");
  const[avisoGps,setAvisoGps]=useState("");
  const[avisoTrajeto,setAvisoTrajeto]=useState("");
  const[avisoAgrupado,setAvisoAgrupado]=useState("");
  const[rotaPath,setRotaPath]=useState(null);
  const[rotaPathSegment,setRotaPathSegment]=useState(null);
  const[dupQueue,setDupQueue]=useState([]);
  const[resultado,setResultado]=useState(null);
  const[horarioBaseMs,setHorarioBaseMs]=useState(null);
  const[mapaExpandido,setMapaExpandido]=useState(false);
  const[posicaoMotorista,setPosicaoMotorista]=useState(null);
  const[paradaRemover,setParadaRemover]=useState(null);
  const[confirmLimpar,setConfirmLimpar]=useState(false);
  const[confirmNovaOtimizacao,setConfirmNovaOtimizacao]=useState(false);
  const[offlineHydrated,setOfflineHydrated]=useState(false);
  const[offlineRestored,setOfflineRestored]=useState(false);
  const[modoNavegacao,setModoNavegacao]=useState(false);
  const[viewNav,setViewNav]=useState("mapa");
  const[showMotivo,setShowMotivo]=useState(false);
  const[showResumo,setShowResumo]=useState(false);
  const[showAddNavMenu,setShowAddNavMenu]=useState(false);
  const[showInsertOpcoes,setShowInsertOpcoes]=useState(false);
  const[paradaPendenteInsert,setParadaPendenteInsert]=useState(null);
  const[novoEnderecoNav,setNovoEnderecoNav]=useState("");
  const[novoDestinatarioNav,setNovoDestinatarioNav]=useState("");
  const[novoPacoteNumNav,setNovoPacoteNumNav]=useState("");
  const[pacotesExtrasNomesNav,setPacotesExtrasNomesNav]=useState([]);
  const[pacotesExtrasNumsNav,setPacotesExtrasNumsNav]=useState([]);
  const[erroNavAdd,setErroNavAdd]=useState("");
  const[adicionandoNav,setAdicionandoNav]=useState(false);
  const[reotimizando,setReotimizando]=useState(false);
  const[historicoEntregas,setHistoricoEntregas]=useState([]);
  const[historicoAbertoId,setHistoricoAbertoId]=useState(null);
  const[salvandoRota,setSalvandoRota]=useState(false);
  const[rotaSalvaId,setRotaSalvaId]=useState(null);
  const[resumoFinal,setResumoFinal]=useState(null);
  const[erroHistoricoSave,setErroHistoricoSave]=useState("");
  const[showConfirmExitNav,setShowConfirmExitNav]=useState(false);
  const[aposConclusao,setAposConclusao]=useState(false);
  const[showPdfShare,setShowPdfShare]=useState(false);
  const[pdfReportData,setPdfReportData]=useState(null);
  const[pdfBlobCache,setPdfBlobCache]=useState(null);
  const[pdfFilenameCache,setPdfFilenameCache]=useState("");
  const[gerandoPdf,setGerandoPdf]=useState(false);
  const[showHistoricoEntregas,setShowHistoricoEntregas]=useState(false);
  const[novoDestinatario,setNovoDestinatario]=useState("");
  const[novoPacoteNum,setNovoPacoteNum]=useState("");
  const[pacotesExtrasNomes,setPacotesExtrasNomes]=useState([]);
  const[pacotesExtrasNums,setPacotesExtrasNums]=useState([]);
  const[showOrdemCarga,setShowOrdemCarga]=useState(false);
  const[listaExpandidaIds,setListaExpandidaIds]=useState(()=>new Set());
  const[pacotesTelaParadaId,setPacotesTelaParadaId]=useState(null);
  const[motivoPacoteTarget,setMotivoPacoteTarget]=useState(null);
  const[editNumId,setEditNumId]=useState(null);
  // V290 — contador monotônico da sequência de pacotes (por sessão de rota)
  const seqRef=useRef(0);

  const isPago=getPlanoAtual(perfil).isPago;
  const LIMITE=isPago?Infinity:10;
  const atingiuLimite=paradas.length>=LIMITE;

  // V166 — GPS do motorista no mapa (e como origem da otimização)
  useEffect(()=>{
    warmGeocodeProximity();
    getDriverGeolocation().then((pos)=>{
      if(pos)setPosicaoMotorista([pos.lng,pos.lat]);
    });
  },[]);

  useEffect(()=>{
    const cached=readOfflineCache(OFFLINE_KEYS.otimizar);
    const nav=readNavigationSession();
    if(nav?.paradas?.length){
      setParadas(migrateParadas(nav.paradas));
      seqRef.current=nav.seq!=null?nav.seq:maxNumeroPacoteSeq(nav.paradas);
      if(nav.resultado){
        setResultado(nav.resultado);
        setHorarioBaseMs(Date.now());
      }
      if(nav.posicaoMotorista)setPosicaoMotorista(nav.posicaoMotorista);
      if(nav.viewNav)setViewNav(nav.viewNav);
      if(resumeNavigation||nav.modoNavegacao){
        setModoNavegacao(true);
        onNavigationResumed?.();
      }
      setOfflineRestored(true);
      setTimeout(()=>setOfflineRestored(false),3500);
    }else if(cached?.paradas?.length){
      setParadas(migrateParadas(cached.paradas));
      seqRef.current=cached.seq!=null?cached.seq:maxNumeroPacoteSeq(cached.paradas);
      setOfflineRestored(true);
      setTimeout(()=>setOfflineRestored(false),3500);
    }
    setOfflineHydrated(true);
  },[]);

  useEffect(()=>{
    if(!resumeNavigation)return;
    const nav=readNavigationSession();
    if(nav?.viewNav)setViewNav(nav.viewNav);
    else setViewNav("mapa");
    setModoNavegacao(true);
    onNavigationResumed?.();
  },[resumeNavigation,onNavigationResumed]);

  // V290 — numeração automática, sequencial e FIXA: todo pacote sem número recebe o
  // próximo da sequência (na ordem de entrada). Números já atribuídos nunca mudam.
  useEffect(()=>{
    if(!offlineHydrated)return;
    let counter=seqRef.current;
    let changed=false;
    const next=paradas.map(p=>{
      const m=migrateParada(p);
      let pacChanged=false;
      const pacotes=m.pacotes.map(pk=>{
        if(String(pk.numero??"").trim()===""){
          counter+=1;
          pacChanged=true;
          return{...pk,numero:String(counter)};
        }
        return pk;
      });
      if(pacChanged){changed=true;return{...m,pacotes};}
      return p;
    });
    if(changed){
      seqRef.current=counter;
      setParadas(next);
    }
  },[offlineHydrated,paradas]);

  useEffect(()=>{
    if(!offlineHydrated)return;
    writeOfflineCache(OFFLINE_KEYS.otimizar,{paradas:migrateParadas(paradas),seq:seqRef.current});
  },[offlineHydrated,paradas]);

  const paradasDedup=useMemo(()=>dedupParadasPorId(paradas),[paradas]);

  const pkgStats=useMemo(()=>countPacotesStats(paradasDedup),[paradasDedup]);
  const entreguesCount=pkgStats.entregues;
  const naoEntreguesCount=pkgStats.naoEntregues;
  const pendentesCount=paradasDedup.filter(p=>getParadaStatus(p)==="pendente").length;
  const todasEntregues=paradasDedup.length>0&&pendentesCount===0;
  const paradaAtualIdx=useMemo(()=>paradasDedup.findIndex(p=>getParadaStatus(p)==="pendente"),[paradasDedup]);
  const paradaAtual=paradaAtualIdx>=0?paradasDedup[paradaAtualIdx]:null;
  const totalPacotes=totalPacotesEmParadas(paradasDedup);
  const pacotesTelaParadaViva=useMemo(()=>{
    if(pacotesTelaParadaId==null)return null;
    const idStr=String(pacotesTelaParadaId);
    const p=paradas.find(x=>String(x.id)===idStr);
    return p||null;
  },[paradas,pacotesTelaParadaId]);
  const pacotesTelaParadaNum=useMemo(()=>{
    if(pacotesTelaParadaId==null)return 0;
    const idx=paradasDedup.findIndex(p=>String(p.id)===String(pacotesTelaParadaId));
    return idx>=0?idx+1:0;
  },[paradasDedup,pacotesTelaParadaId]);

  // V233 — toast discreto de agrupamento some sozinho
  useEffect(()=>{
    if(!avisoAgrupado)return;
    const t=setTimeout(()=>setAvisoAgrupado(""),4500);
    return()=>clearTimeout(t);
  },[avisoAgrupado]);

  // V233 — card de economia sempre visível: rola até ele após a otimização
  const resultadoRef=useRef(null);
  useEffect(()=>{
    if(resultado&&resultadoRef.current){
      resultadoRef.current.scrollIntoView({behavior:"smooth",block:"nearest"});
    }
  },[resultado]);

  // V233 — regra por densidade: até 10 paradas desenha a linha completa;
  // acima disso só o trecho posição atual → próximas 3 pendentes (redesenha a cada entrega)
  const ROTA_DENSA_LIMITE=10;
  const rotaDensa=paradas.length>ROTA_DENSA_LIMITE;
  const proximasPendentesKey=paradas.filter(p=>getParadaStatus(p)==="pendente").slice(0,3).map(p=>p.id).join("|");
  useEffect(()=>{
    if(!resultado||!rotaDensa){setRotaPathSegment(null);return;}
    let cancelled=false;
    (async()=>{
      try{
        const pend=paradas.filter(p=>getParadaStatus(p)==="pendente"&&p.coords?.length>=2).slice(0,3);
        const seg=await fetchRouteSegmentPath(posicaoMotorista?.length>=2?posicaoMotorista:null,pend);
        if(!cancelled)setRotaPathSegment(seg);
      }catch{
        if(!cancelled)setRotaPathSegment(null);
      }
    })();
    return()=>{cancelled=true;};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[resultado,rotaDensa,proximasPendentesKey,posicaoMotorista]);

  const rotaPathExibida=resultado?(rotaDensa?rotaPathSegment:rotaPath):null;

  useEffect(()=>{
    if(!offlineHydrated)return;
    if(showResumo||!paradas.length){
      clearNavigationSession();
      return;
    }
    if(resultado&&pendentesCount>0){
      writeNavigationSession({
        active:true,
        modoNavegacao,
        paradas,
        resultado,
        posicaoMotorista,
        viewNav,
        seq:seqRef.current,
      });
    }else if(pendentesCount>0&&readNavigationSession()?.active){
      // V232 — contador sincronizado: adicionar/remover parada zera `resultado`,
      // mas a sessão ativa precisa refletir o novo N imediatamente
      // (banner "Parada X de N" e cabeçalho "N endereços")
      writeNavigationSession({
        active:true,
        modoNavegacao,
        paradas,
        resultado,
        posicaoMotorista,
        viewNav,
        seq:seqRef.current,
      });
    }
  },[offlineHydrated,modoNavegacao,paradas,resultado,posicaoMotorista,viewNav,pendentesCount,showResumo]);

  const carregarHistorico=useCallback(async()=>{
    if(!uid)return;
    try{
      const rotas=await loadDeliveryRoutes(uid);
      setHistoricoEntregas(rotas);
    }catch{/* ignore */}
  },[uid]);

  useEffect(()=>{carregarHistorico();},[carregarHistorico]);

  const finalizarRota=useCallback(async(listaParadas)=>{
    const lista=migrateParadas(listaParadas||paradas);
    const ts=formatNowBR();
    const resultadoSnapshot=resultado?{...resultado}:null;
    const statsPkg=countPacotesStats(lista);
    const stats={
      total:lista.length,
      entregues:statsPkg.entregues,
      naoEntregues:statsPkg.naoEntregues,
      motivos:lista.flatMap(p=>
        (migrateParada(p).pacotes||[])
          .filter(pk=>pk.status==="nao_entregue")
          .map(pk=>({
            id:p.id,
            endereco:p.endereco,
            pacote:pacoteDisplayName(pk,(migrateParada(p).pacotes||[]).indexOf(pk)),
            motivo:pk.motivoNaoEntrega||"—",
          }))
      ),
      data:ts.data,
      hora:ts.horario,
      motorista:perfil?.nome||"",
      paradas:lista.map(p=>sanitizeParadaForFirestore(p)),
    };

    setModoNavegacao(false);
    setViewNav("mapa");
    setResumoFinal(stats);
    setParadas([]);
    setResultado(null);
    setAposConclusao(true);
    seqRef.current=0;
    clearNavigationSession();
    writeOfflineCache(OFFLINE_KEYS.otimizar,{paradas:[],seq:0});
    setShowResumo(true);

    if(!uid){
      setErroHistoricoSave("Faça login para sincronizar o histórico na nuvem.");
      return;
    }

    setSalvandoRota(true);
    setErroHistoricoSave("");
    setRotaSalvaId(null);
    try{
      const saved=await saveDeliveryRoute(uid,{
        date:ts.data,
        hora:ts.horario,
        motorista:perfil?.nome||"",
        paradas:lista.map(p=>sanitizeParadaForFirestore(p)),
        resultado:resultadoSnapshot,
      });
      setRotaSalvaId(saved.id);
      await carregarHistorico();
      if(saved.synced===false){
        setErroHistoricoSave("Rota salva no dispositivo. Não foi possível sincronizar com a nuvem — verifique conexão.");
      }
    }catch{
      setErroHistoricoSave("Erro ao salvar a rota. Tente novamente.");
    }finally{
      setSalvandoRota(false);
    }
  },[uid,paradas,resultado,perfil?.nome,carregarHistorico]);

  useEffect(()=>{
    if(!modoNavegacao||!paradas.length||showResumo)return;
    if(pendentesCount===0)finalizarRota(paradas);
  },[modoNavegacao,pendentesCount,paradas,showResumo,finalizarRota]);

  const aplicarMarcarPacote=(paradaId,pacoteId,status,motivoNaoEntrega="")=>{
    const ts=formatNowBR();
    const idStr=String(paradaId);
    const pkgStr=String(pacoteId);
    const origem=pacotesTelaParadaId!=null&&String(pacotesTelaParadaId)===idStr?"tela dedicada":"inline";
    let achou=false;
    const next=paradas.map((x)=>{
      if(String(x.id)!==idStr)return x;
      const base=migrateParada(x);
      if(!base.pacotes?.some(pk=>String(pk.id)===pkgStr))return base;
      achou=true;
      return marcarPacoteNaParada(base,pacoteId,status,motivoNaoEntrega,ts);
    });
    logPacotes("marcar status",{paradaId,pacoteId,status:status,achou,origem});
    if(!achou){
      logPacotes("marcar status falhou",{paradaId,pacoteId,status});
      return;
    }
    if(status==="nao_entregue"){
      logPacotes("marcar nao entregue",{paradaId,pacoteId,motivo:motivoNaoEntrega,origem});
    }
    const atualizada=next.find(x=>String(x.id)===idStr);
    if(atualizada&&getParadaStatus(atualizada)==="concluida"){
      logPacotes("concluir parada",{paradaId,endereco:atualizada.endereco});
    }
    setParadas(next);
    setShowMotivo(false);
    setMotivoPacoteTarget(null);
  };

  const abrirPacotesTela=(paradaId)=>{
    const idStr=String(paradaId);
    setParadas(prev=>prev.map(x=>String(x.id)===idStr?migrateParada(x):x));
    setPacotesTelaParadaId(paradaId);
    logPacotes("abrir tela dedicada",{paradaId});
  };

  const handleNavEntregue=()=>{
    if(paradaAtualIdx<0||!paradaAtual)return;
    const p=migrateParada(paradaAtual);
    if(p.pacotes.length<=1){
      const pk=p.pacotes[0];
      if(pk?.status==="pendente")aplicarMarcarPacote(p.id,pk.id,"entregue");
      return;
    }
    abrirPacotesTela(p.id);
  };

  const handleNavNaoEntregue=()=>{
    if(paradaAtualIdx<0||!paradaAtual)return;
    const p=migrateParada(paradaAtual);
    if(p.pacotes.length<=1){
      const pk=p.pacotes[0];
      if(pk?.status==="pendente"){
        setMotivoPacoteTarget({paradaId:p.id,pacoteId:pk.id});
        setShowMotivo(true);
      }
      return;
    }
    abrirPacotesTela(p.id);
  };

  const handlePacoteNaoEntregue=(paradaId,pacoteId)=>{
    setMotivoPacoteTarget({paradaId,pacoteId});
    setShowMotivo(true);
  };

  const toggleListaExpand=(id)=>{
    const p=paradasDedup.find(x=>x.id===id);
    if(p&&countPacotes(p)>1)return;
    setListaExpandidaIds(prev=>{
      const next=new Set(prev);
      if(next.has(id))next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const iniciarNavegacao=()=>{
    if(!resultado||paradas.length<1)return;
    setHorarioBaseMs(Date.now());
    setRotaSalvaId(null);
    setShowResumo(false);
    setModoNavegacao(true);
    setViewNav("mapa");
  };

  const reiniciarRota=()=>{
    setParadas([]);
    setResultado(null);
    setHorarioBaseMs(null);
    setRotaPath(null);
    setRotaPathSegment(null);
    setAvisoGps("");
    setAvisoTrajeto("");
    setAvisoAgrupado("");
    setDupQueue([]);
    setShowResumo(false);
    setResumoFinal(null);
    setErroHistoricoSave("");
    setModoNavegacao(false);
    setViewNav("mapa");
    setRotaSalvaId(null);
    setConfirmNovaOtimizacao(false);
    setAposConclusao(true);
    seqRef.current=0;
    clearNavigationSession();
    writeOfflineCache(OFFLINE_KEYS.otimizar,{paradas:[],seq:0});
  };

  const pausarNavegacao=()=>{
    setModoNavegacao(false);
    setShowConfirmExitNav(false);
  };

  const aplicarInsertParada=async(modo,novaParada)=>{
    setShowInsertOpcoes(false);
    setParadaPendenteInsert(null);
    if(!novaParada)return;

    if(modo==="proxima"){
      setParadas(prev=>{
        const idx=paradaAtualIdx>=0?paradaAtualIdx+1:prev.length;
        const next=[...prev];
        next.splice(idx,0,{...novaParada,id:novaParada.id||Date.now()});
        return next;
      });
      setShowAddNavMenu(false);
      return;
    }

    if(modo==="final"){
      setParadas(prev=>[...prev,criarParadaNova({...novaParada,id:novaParada.id||Date.now(),endereco:novaParada.endereco,coords:novaParada.coords,nomes:[""]})]);
      setShowAddNavMenu(false);
      return;
    }

    if(modo==="eficiente"){
      setReotimizando(true);
      setErroNavAdd("");
      try{
        let driverCoords=posicaoMotorista;
        if(!driverCoords?.length){
          const fresh=await getDriverGeolocation({preferFresh:true});
          if(fresh){
            driverCoords=[fresh.lng,fresh.lat];
            setPosicaoMotorista(driverCoords);
          }
        }
        const concluidas=paradas.filter(p=>getParadaStatus(p)!=="pendente");
        const pendentes=paradas.filter(p=>getParadaStatus(p)==="pendente");
        const out=await reoptimizeRemainingDeliveryRoute(concluidas,pendentes,{
          ...novaParada,
          id:novaParada.id||Date.now(),
          status:"pendente",
        },{
          consumoKmL:perfil?.consumo,
          precoCombustivel:5.89,
          driverOriginCoords:driverCoords,
          useHybrid:USE_HYBRID_OPTIMIZER,
        });
        if(out.ok){
          setParadas(out.paradas);
          if(out.motoristaCoords)setPosicaoMotorista(out.motoristaCoords);
        }else{
          setErroNavAdd(out.error||"Não foi possível reotimizar a rota restante.");
        }
      }catch{
        setErroNavAdd("Erro ao reotimizar. Tente novamente.");
      }finally{
        setReotimizando(false);
        setShowAddNavMenu(false);
      }
    }
  };

  const handleGerarPdf=async(reportData)=>{
    if(!reportData||gerandoPdf)return;
    setGerandoPdf(true);
    try{
      const {blob,filename,method}=await saveDeliveryReportPdf(reportData);
      if(method==="cancelled")return;
      setPdfBlobCache(blob);
      setPdfFilenameCache(filename);
      setPdfReportData(reportData);
      setShowPdfShare(true);
    }catch{
      setErroHistoricoSave("Não foi possível gerar o PDF.");
    }finally{
      setGerandoPdf(false);
    }
  };

  const reportFromHistorico=(r)=>(
    r?{
      motorista:r.motorista||perfil?.nome||"",
      date:r.date||"",
      hora:r.hora||"",
      total:r.totalParadas||r.paradas?.length||0,
      entregues:r.entregues??0,
      naoEntregues:r.naoEntregues??0,
      paradas:r.paradas||[],
    }:null
  );

  const handleNavScannerSuccess=async(novasParadas,meta)=>{
    setErroNavAdd("");
    const novas=Array.isArray(novasParadas)?novasParadas:[];
    if(!novas.length){setErroNavAdd("Nenhum endereço válido na foto.");return;}
    setAdicionandoNav(true);
    try{
      const geocoded=await geocodeRomaneioExtractedAddresses(novas);
      if(geocoded[0]){
        // V233 — duplicado de parada PENDENTE: oferece adicionar pacote em vez de criar parada
        const dupIdx=findDuplicateStopIndex(paradas,geocoded[0]);
        if(dupIdx>=0&&getParadaStatus(paradas[dupIdx])==="pendente"){
          setDupQueue(q=>[...q,{parada:geocoded[0],idx:dupIdx}]);
          setShowAddNavMenu(false);
          return;
        }
        setParadaPendenteInsert(geocoded[0]);
        setShowInsertOpcoes(true);
        setShowAddNavMenu(false);
      }else setErroNavAdd("Não foi possível localizar o endereço.");
    }catch{setErroNavAdd("Erro ao localizar endereço.");}
    finally{setAdicionandoNav(false);}
  };

  const handleNavManualAdd=async()=>{
    if(!novoEnderecoNav.trim()||adicionandoNav||reotimizando)return;
    setErroNavAdd("");
    setAdicionandoNav(true);
    try{
      const out=await resolveManualAddress(novoEnderecoNav,{
        proximityLngLat:posicaoMotorista?.length>=2?posicaoMotorista:resolveStopGeocodeBias(paradas.map(p=>p.coords)),
      });
      if(!out.ok){setErroNavAdd(out.error);return;}
      const nomes=[novoDestinatarioNav,...pacotesExtrasNomesNav];
      const numeros=[novoPacoteNumNav,...pacotesExtrasNumsNav];
      const nova=criarParadaNova({id:Date.now(),endereco:out.endereco,coords:out.coords,nomes,numeros});
      resetNavAddForm();
      // V233 — duplicado de parada PENDENTE: oferece adicionar pacote em vez de criar parada
      const dupIdx=findDuplicateStopIndex(paradas,nova);
      if(dupIdx>=0&&getParadaStatus(paradas[dupIdx])==="pendente"){
        setDupQueue(q=>[...q,{parada:nova,idx:dupIdx}]);
        setShowAddNavMenu(false);
        return;
      }
      setParadaPendenteInsert(nova);
      setShowInsertOpcoes(true);
      setShowAddNavMenu(false);
    }catch{setErroNavAdd("Não foi possível validar o endereço.");}
    finally{setAdicionandoNav(false);}
  };

  // V233 — duplicado durante a rota: adiciona pacote à parada pendente existente
  const confirmarPacoteNaParada=()=>{
    const item=dupQueue[0];
    setDupQueue(q=>q.slice(1));
    if(!item)return;
    const alvo=paradas[item.idx];
    if(!alvo)return;
    const nome=migrateParada(item.parada).pacotes?.[0]?.nome||"";
    const atualizado=adicionarPacoteNaParada(alvo,nome);
    const total=migrateParada(atualizado).pacotes.length;
    logPacotes("importar duplicado",{idx:item.idx,nome,total});
    setParadas(p=>p.map((x,i)=>i===item.idx?atualizado:x));
    setAvisoAgrupado(`📦 ${total} pacotes agrupados em ${alvo.endereco}`);
  };
  const cancelarPacoteNaParada=()=>setDupQueue(q=>q.slice(1));

  // V236 — overlay imediato no toque em importar (antes do OCR assíncrono)
  const handleImportStart=useCallback(()=>{
    flushSync(()=>{
      overlayFlowRef.current="importar";
      setOverlayMsg("Lendo arquivo...");
      setProcessandoFoto(true);
    });
  },[]);
  const handleImportEnd=useCallback(()=>{
    setOverlayMsg("");
    setProcessandoFoto(false);
  },[]);

  // Geocoding Google com proximity (GPS + cadeia) p/ endereços do OCR (Vision)
  // V169 — paradas com confianca ok|warn; feedback para FAIL
  const handleScannerSuccess=async(novasParadas,meta)=>{
    setErroFoto("");
    setAvisoScanFalha("");
    setResultado(null);
    const novas=Array.isArray(novasParadas)?novasParadas:[];
    if(novas.length===0){
      setErroFoto("Nenhum endereço válido após limpeza do texto.");
      setProcessandoFoto(false);
      setOverlayMsg("");
      return;
    }
    if(meta?.failedCount>0){
      const n=meta.failedCount;
      setAvisoScanFalha(
        `❌ ${n===1?"Endereço não identificado":"Endereços não identificados"} — adicione manualmente`
      );
    }
    setProcessandoFoto(true);
    // V236 — fase de geocodificação após leitura do arquivo
    overlayFlowRef.current="importar";
    setOverlayMsg(`📍 Localizando endereços... 0 de ${novas.length}`);
    try{
      const geocoded=await geocodeRomaneioExtractedAddresses(novas,(feitos,total)=>{
        setOverlayMsg(`📍 Localizando endereços... ${feitos} de ${total}`);
      });
      // V233 — duplicados (romaneio repete endereço = mais pacotes na mesma porta):
      // agrupa em uma única parada e soma os pacotes
      const unicos=[];
      const addsExistentes=new Map();
      const enderecosAgrupados=new Set();
      for(const g of geocoded){
        const mig=migrateParada(g);
        const nome=mig.pacotes?.[0]?.nome||"";
        const idxExist=findDuplicateStopIndex(paradas,g);
        if(idxExist>=0){
          const lista=addsExistentes.get(idxExist)||[];
          lista.push(nome);
          addsExistentes.set(idxExist,lista);
          enderecosAgrupados.add(paradas[idxExist].endereco);
          continue;
        }
        const idxNovo=findDuplicateStopIndex(unicos,g);
        if(idxNovo>=0){
          unicos[idxNovo]=adicionarPacoteNaParada(unicos[idxNovo],nome);
          enderecosAgrupados.add(unicos[idxNovo].endereco);
          continue;
        }
        unicos.push(mig);
      }
      setParadas(p=>{
        let atualizadas=migrateParadas(p).map((x,i)=>{
          if(!addsExistentes.has(i))return x;
          let par=x;
          for(const nome of addsExistentes.get(i))par=adicionarPacoteNaParada(par,nome);
          return par;
        });
        return[...atualizadas,...unicos];
      });
      logPacotes("importar",{novos:geocoded.length,agrupados:enderecosAgrupados.size});
      if(enderecosAgrupados.size===1){
        const end=[...enderecosAgrupados][0];
        const idxAlvo=paradas.findIndex(p=>p.endereco===end);
        const total=idxAlvo>=0?migrateParada(paradas[idxAlvo]).pacotes.length+([...addsExistentes.values()].flat().length):migrateParada(unicos.find(u=>u.endereco===end)||{}).pacotes?.length||1;
        setAvisoAgrupado(`📦 ${total} pacotes agrupados em ${end}`);
      }else if(enderecosAgrupados.size>1){
        setAvisoAgrupado(`📦 Pacotes agrupados em ${enderecosAgrupados.size} endereços repetidos`);
      }
      setAposConclusao(false);
    }catch{
      setErroFoto("Erro ao localizar endereços no mapa. Tente de novo.");
    }finally{
      setProcessandoFoto(false);
      setOverlayMsg("");
    }
  };

  const adicionarManual=async()=>{
    if(!novoEndereco.trim()||atingiuLimite||adicionandoManual)return;
    setErroManual("");
    setAdicionandoManual(true);
    try{
      // V232 — viés de proximidade: GPS do motorista ou média das paradas já geocodificadas
      const out=await resolveManualAddress(novoEndereco,{
        proximityLngLat:resolveStopGeocodeBias(paradas.map(p=>p.coords)),
      });
      if(!out.ok){
        setErroManual(out.error);
        return;
      }
      const nomes=[novoDestinatario,...pacotesExtrasNomes];
      const numeros=[novoPacoteNum,...pacotesExtrasNums];
      const nova=criarParadaNova({id:Date.now(),endereco:out.endereco,coords:out.coords,nomes,numeros});
      const dupIdx=findDuplicateStopIndex(paradas,nova);
      if(dupIdx>=0){
        let par=paradas[dupIdx];
        nomes.forEach((nome,i)=>{par=adicionarPacoteNaParada(par,nome,numeros[i]||"");});
        const total=migrateParada(par).pacotes.length;
        logPacotes("manual duplicado",{idx:dupIdx,total});
        setParadas(p=>p.map((x,i)=>i===dupIdx?par:x));
        setAvisoAgrupado(`📦 ${total} pacotes agrupados em ${paradas[dupIdx].endereco}`);
        setNovoEndereco("");
        setNovoDestinatario("");
        setNovoPacoteNum("");
        setPacotesExtrasNomes([]);
        setPacotesExtrasNums([]);
        return;
      }
      setParadas(p=>[...p,nova]);
      setNovoEndereco("");
      setNovoDestinatario("");
      setNovoPacoteNum("");
      setPacotesExtrasNomes([]);
      setPacotesExtrasNums([]);
      setResultado(null);
      setAposConclusao(false);
    }catch{
      setErroManual("Não foi possível validar o endereço. Verifique sua conexão e tente de novo.");
    }finally{
      setAdicionandoManual(false);
    }
  };

  const removerParada=(id)=>{
    setParadas(p=>p.filter(x=>x.id!==id));
    setResultado(null);
  };

  // V289 — editar nº do pacote direto na lista (usa o campo numero de cada pacote)
  const setPacoteNumero=(paradaId,pacoteId,numero)=>{
    setParadas(prev=>prev.map(p=>{
      if(String(p.id)!==String(paradaId))return p;
      const m=migrateParada(p);
      return{...m,pacotes:m.pacotes.map(pk=>pk.id===pacoteId?{...pk,numero}:pk)};
    }));
  };

  // V289 — limpa os campos do formulário "Adicionar parada" (navegação)
  const resetNavAddForm=()=>{
    setNovoEnderecoNav("");
    setNovoDestinatarioNav("");
    setNovoPacoteNumNav("");
    setPacotesExtrasNomesNav([]);
    setPacotesExtrasNumsNav([]);
    setErroNavAdd("");
  };

  // V231 — motor híbrido: GPS fresco → NN + 2-opt no aparelho → Directions em blocos.
  // V166 (legado, USE_HYBRID_OPTIMIZER=false) — geocoding → GPS como origin → waypoints otimizáveis.
  const handleOtimizarRota=async()=>{
    if(paradas.length<2||otimizando)return;
    setOtimizando(true);
    setErroOtimizar("");
    setAvisoGps("");
    setAvisoTrajeto("");
    setResultado(null);
    setRotaPath(null);
    setRotaPathSegment(null);
    overlayFlowRef.current="otimizar";
    setOverlayMsg("📍 Localizando endereços...");
    const STAGE_MSGS={
      geocodificando:"📍 Localizando endereços...",
      otimizando:"🧠 Calculando a melhor ordem...",
      desenhando:"🗺️ Desenhando a rota...",
    };
    try{
      const out=USE_HYBRID_OPTIMIZER
        ?await optimizeDeliveryRouteHybrid(paradas,{
          consumoKmL:perfil?.consumo,
          precoCombustivel:5.89,
          onStage:s=>{if(STAGE_MSGS[s])setOverlayMsg(STAGE_MSGS[s]);},
        })
        :await optimizeDeliveryRoute(paradas,{
          consumoKmL:perfil?.consumo,
          precoCombustivel:5.89,
        });
      if(!out.ok){
        if(out.paradasInvalidas?.length){
          setParadas(p=>p.map(x=>out.paradasInvalidas.includes(x.id)?{...x,geocodeFalhou:true}:{...x,geocodeFalhou:false}));
        }
        if(out.paradasForaDaArea?.length){
          setParadas(p=>p.map(x=>out.paradasForaDaArea.includes(x.id)?{...x,outlier:true}:{...x,outlier:false}));
        }
        setErroOtimizar(out.error);
        return;
      }
      if(out.gpsFalhou)setAvisoGps("⚠️ GPS indisponível — rota calculada a partir da primeira parada");
      if(out.trajetoParcial)setAvisoTrajeto("Trajeto parcial no mapa — a ordem das paradas está correta");
      if(out.motoristaCoords)setPosicaoMotorista(out.motoristaCoords);
      setParadas(out.paradasOtimizadas);
      setResultado(out.resultado);
      setHorarioBaseMs(Date.now());
      if(out.routePath?.length)setRotaPath(out.routePath);
      setAposConclusao(false);
      onConcluido?.("roteirizacao");
    }catch{
      setErroOtimizar("Erro ao otimizar a rota. Verifique sua conexão e tente novamente.");
    }finally{
      setOtimizando(false);
      setOverlayMsg("");
    }
  };

  // V287 — usar rota na ordem adicionada, sem otimizar (não consome contagem de otimização)
  const handleUsarRotaComoEsta=()=>{
    if(paradas.length<2||otimizando)return;
    setErroOtimizar("");
    setAvisoGps("");
    setAvisoTrajeto("");
    setRotaPath(null);
    setRotaPathSegment(null);
    setResultado({semOtimizacao:true,economiaKm:0,economiaCusto:0});
    setHorarioBaseMs(Date.now());
    setAposConclusao(false);
    setRotaSalvaId(null);
    setShowResumo(false);
    setModoNavegacao(true);
    setViewNav("mapa");
  };

  // V287 — linhas do resumo (economia oculta no modo "usar rota como está")
  const detalheRows=useMemo(()=>{
    if(!resultado)return[];
    return[
      resultado.kmOtimizado!=null&&{emoji:"📍",label:"Distância otimizada",valor:formatKmDecimal(resultado.kmOtimizado)},
      resultado.tempoEstimado!=null&&{emoji:"⏱️",label:"Tempo estimado",valor:`${resultado.tempoEstimado} min`},
      resultado.custoTotal!=null&&{emoji:"⛽",label:"Custo combustível",valor:formatMoeda(resultado.custoTotal)},
      !resultado.semOtimizacao&&{emoji:"✂️",label:"Distância economizada",valor:formatKmDecimal(resultado.economiaKm),cor:OTIMIZAR_AZUL},
      !resultado.semOtimizacao&&{emoji:"💰",label:"Economia em R$",valor:formatMoeda(resultado.economiaCusto),cor:OTIMIZAR_AZUL},
    ].filter(Boolean);
  },[resultado]);

  const etasParadas=useMemo(()=>{
    if(!horarioBaseMs||!resultado?.legDurationsS?.length)return[];
    return calcularETAsParadas(resultado.legDurationsS,horarioBaseMs);
  },[horarioBaseMs,resultado?.legDurationsS]);

  const headerTotaisLista=useMemo(()=>{
    if(!resultado)return null;
    const parts=[];
    const dur=
      formatDurationApprox(resultado.tempoEstimadoSeg)!=null
        ?formatDurationApprox(resultado.tempoEstimadoSeg)
        :(resultado.tempoEstimado!=null?formatDurationApprox(resultado.tempoEstimado*60):null);
    if(dur)parts.push(`Tempo estimado: ${dur}`);
    if(paradasDedup.length>0)parts.push(`${paradasDedup.length} parada${paradasDedup.length!==1?"s":""}`);
    if(resultado.kmOtimizado!=null){
      const km=formatKmDecimal(resultado.kmOtimizado);
      if(km&&km!=="—")parts.push(km);
    }
    return parts.length?parts.join(" · "):null;
  },[resultado,paradasDedup.length]);

  // V235 — timeout de segurança do overlay (60s): fecha com aviso, nunca fica preso
  const handleOverlayTimeout=useCallback(()=>{
    setOverlayMsg("");
    setOtimizando(false);
    setProcessandoFoto(false);
    const aviso="⏱️ A operação demorou mais que o esperado. Verifique sua conexão e tente novamente.";
    if(overlayFlowRef.current==="importar")setErroFoto(aviso);
    else setErroOtimizar(aviso);
  },[]);

  return(
    <ModalWrap maxW={500}>
      {/* Header */}
      <ModalHeader title="📦 Otimizar Entregas" sub="Rota perfeita para múltiplas paradas" icon={RouteIcon} iconColor={OTIMIZAR_AZUL} onClose={onClose}/>
      <OfflineRestoredBanner show={offlineRestored}/>

      {/* V235 — overlay de progresso (um componente, dois usos: otimização e importação) */}
      <ProgressOverlay visible={!!overlayMsg} message={overlayMsg} onTimeout={handleOverlayTimeout}/>

      <ScannerModule
        disabled={atingiuLimite||processandoFoto}
        maxToAdd={Number.isFinite(LIMITE)?LIMITE-paradas.length:999}
        isPro={isPago}
        onSuccess={handleScannerSuccess}
        onError={setErroFoto}
        onProcessingChange={setProcessandoFoto}
        onImportStart={handleImportStart}
        onImportEnd={handleImportEnd}
        accentColor={OTIMIZAR_AZUL}
        accentDark={OTIMIZAR_AZUL_MID}
        accentLight="#EEF4FF"
        accentBorder="#BFDBFE"
      />

      {/* Erro foto */}
      {erroFoto&&(
        <div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",marginBottom:12,color:"#DC2626",fontSize:13,fontWeight:600}}>
          {erroFoto.startsWith("❌")?erroFoto:`⚠️ ${erroFoto}`}
        </div>
      )}

      {avisoScanFalha&&(
        <div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",marginBottom:12,color:"#DC2626",fontSize:13,fontWeight:600}}>
          {avisoScanFalha}
        </div>
      )}

      {/* Input manual */}
      {erroManual&&(
        <div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",marginBottom:10,color:"#DC2626",fontSize:13,fontWeight:600}}>
          ⚠️ {erroManual}
        </div>
      )}
      <div style={{marginBottom:atingiuLimite?8:14}}>
        <EnderecoPacotesForm
          endereco={novoEndereco} setEndereco={setNovoEndereco}
          destinatario={novoDestinatario} setDestinatario={setNovoDestinatario}
          pacoteNum={novoPacoteNum} setPacoteNum={setNovoPacoteNum}
          extrasNomes={pacotesExtrasNomes} setExtrasNomes={setPacotesExtrasNomes}
          extrasNums={pacotesExtrasNums} setExtrasNums={setPacotesExtrasNums}
          onSubmit={adicionarManual}
          submitLabel="Adicionar"
          submitting={adicionandoManual}
          disabled={atingiuLimite}
          addressPlaceholder={atingiuLimite?"Limite de paradas atingido":"Ex.: Rua das Flores, 100 - Centro"}
          onErro={setErroManual}
        />
      </div>

      {/* Banner limite atingido */}
      {atingiuLimite&&!isPago&&(
        <div style={{background:"linear-gradient(135deg,#FFF7ED,#FFEDD5)",border:"1.5px solid #FED7AA",borderRadius:13,padding:"14px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:12}}>
          <span style={{fontSize:24}}>🔒</span>
          <div style={{flex:1}}>
            <div style={{color:"#92400E",fontWeight:800,fontSize:13}}>Limite de 10 paradas atingido</div>
            <div style={{color:"#B45309",fontSize:12,marginTop:2,lineHeight:1.4}}>Remova uma parada para adicionar outra.</div>
          </div>
        </div>
      )}

      {/* Lista de paradas */}
      {paradas.length===0&&(
        <div style={{background:C.subtle,border:`1.5px dashed ${C.border}`,borderRadius:14,padding:"28px 20px",textAlign:"center",marginBottom:14}}>
          <div style={{fontSize:36,marginBottom:8}}>📍</div>
          <div style={{color:C.text,fontWeight:700,fontSize:14,marginBottom:4}}>Nenhuma parada adicionada</div>
          <div style={{color:C.muted,fontSize:13}}>Importe um romaneio ou adicione endereços manualmente</div>
        </div>
      )}

      {paradas.length>=2&&(
        <div style={{marginBottom:14}}>
          <div style={{color:C.navy,fontWeight:700,fontSize:13,marginBottom:8}}>🗺️ Mapa das entregas</div>
          {/* V233 — sem `key`: o mapa não é recriado a cada mudança de status (polyline estável) */}
          <DeliveryMap
            paradas={paradas}
            motoristaCoords={posicaoMotorista}
            height={240}
            showLocateButton
            onDriverLocationUpdate={setPosicaoMotorista}
            routePath={rotaPathExibida}
          />
          {/* V161 — expandir mapa em overlay tela cheia */}
          <button
            type="button"
            onClick={()=>setMapaExpandido(true)}
            style={{
              marginTop:10,
              width:"100%",
              padding:"10px 14px",
              background:"#EFF6FF",
              border:"1.5px solid #BFDBFE",
              borderRadius:10,
              cursor:"pointer",
              color:"#1D4ED8",
              fontWeight:700,
              fontSize:13,
              display:"flex",
              alignItems:"center",
              justifyContent:"center",
              gap:8,
            }}
          >
            <span style={{fontSize:16}}>⛶</span> Expandir mapa
          </button>
        </div>
      )}

      {mapaExpandido&&paradas.length>=2&&(
        <div
          style={{
            position:"fixed",
            inset:0,
            zIndex:500,
            background:"rgba(15,23,42,0.72)",
            display:"flex",
            alignItems:"center",
            justifyContent:"center",
          }}
        >
          <div
            style={{
              position:"relative",
              width:"100%",
              height:"90vh",
              maxWidth:"100vw",
              padding:"0 12px",
              boxSizing:"border-box",
            }}
          >
            <button
              type="button"
              onClick={()=>setMapaExpandido(false)}
              aria-label="Fechar mapa"
              style={{
                position:"absolute",
                top:8,
                right:20,
                zIndex:502,
                width:40,
                height:40,
                borderRadius:10,
                border:"none",
                background:"#fff",
                boxShadow:"0 4px 16px #00000044",
                cursor:"pointer",
                display:"flex",
                alignItems:"center",
                justifyContent:"center",
                color:C.muted,
              }}
            >
              <XIcon size={18}/>
            </button>
            <div style={{width:"100%",height:"100%",borderRadius:12,overflow:"hidden"}}>
              <DeliveryMap
                paradas={paradas}
                motoristaCoords={posicaoMotorista}
                height="90vh"
                showLocateButton
                expandedMap
                gestureHandling="greedy"
                onDriverLocationUpdate={setPosicaoMotorista}
                routePath={rotaPathExibida}
              />
            </div>
          </div>
        </div>
      )}

      {todasEntregues&&(
        <div style={{background:`linear-gradient(135deg,${OTIMIZAR_AZUL},${OTIMIZAR_AZUL_MID})`,borderRadius:12,padding:"12px 16px",marginBottom:14,textAlign:"center",boxShadow:`0 4px 14px ${OTIMIZAR_AZUL}44`}}>
          <span style={{color:"#fff",fontWeight:800,fontSize:14}}>🎉 Todas as entregas concluídas!</span>
        </div>
      )}

      {paradas.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{color:C.navy,fontWeight:700,fontSize:13}}>
              {paradasDedup.length} endereço{paradasDedup.length!==1?"s":""}{totalPacotes>paradasDedup.length?` · ${totalPacotes} pacotes`:""} · {entreguesCount} entregue{entreguesCount!==1?"s":""} · {pendentesCount} pendente{pendentesCount!==1?"s":""}
              {resultado&&!modoNavegacao&&(
                <span style={{marginLeft:6,color:OTIMIZAR_AZUL,fontWeight:600}}>— rota otimizada ✅</span>
              )}
            </span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {!isPago&&(
                <span style={{color:atingiuLimite?C.red:C.muted,fontSize:11,fontWeight:600}}>
                  {paradas.length}/10
                </span>
              )}
              <button onClick={()=>setConfirmLimpar(true)}
                style={{background:C.redLight,border:"none",borderRadius:8,padding:"4px 10px",cursor:"pointer",color:C.red,fontSize:11,fontWeight:600}}>
                Limpar tudo
              </button>
            </div>
          </div>
          {headerTotaisLista&&(
            <div style={{color:C.muted,fontSize:12,fontWeight:600,marginBottom:2}}>
              {headerTotaisLista}
            </div>
          )}
          {paradasDedup.map((p,i)=>(
            <div key={`parada-${p.id}`} onClick={()=>setEditNumId(prev=>String(prev)===String(p.id)?null:p.id)} style={{
              display:"flex",flexDirection:"column",gap:8,
              background:paradaCardBg(p),
              border:`1.5px solid ${p.geocodeFalhou||p.outlier?C.amber:paradaCardBorder(p,i,paradaAtualIdx,modoNavegacao)}`,
              borderRadius:11,padding:"10px 11px",transition:"all .3s",position:"relative",cursor:"pointer",
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10,paddingRight:36}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:44,flexShrink:0}}>
                  <div style={{width:30,height:30,borderRadius:"50%",background:OTIMIZAR_AZUL_MID,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{color:"#fff",fontWeight:700,fontSize:12}}>{i+1}</span>
                  </div>
                  {etasParadas[i]&&etasParadas[i]!=="—"&&(
                    <span style={{fontSize:11,fontWeight:600,color:"#6B7280",lineHeight:1.2}}>
                      {etasParadas[i]}
                    </span>
                  )}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:getParadaStatus(p)!=="pendente"?"#64748B":C.text,fontSize:13,textDecoration:getParadaStatus(p)!=="pendente"?"line-through":"none",lineHeight:1.4}}>
                    {p.endereco}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:12,rowGap:6,marginTop:6,alignItems:"center"}}>
                    {pacotesNumerosLabel(p)?(
                      <div style={{display:"inline-block",background:"#fff",border:`1px solid ${OTIMIZAR_LARANJA}`,borderRadius:10,padding:"2px 8px",color:OTIMIZAR_LARANJA,fontSize:12,fontWeight:500}}>
                        📦 {pacotesNumerosLabel(p)}
                      </div>
                    ):(
                      <div style={{display:"inline-block",color:C.muted,fontSize:11,fontWeight:600,opacity:.85}}>
                        📦 + nº
                      </div>
                    )}
                    {getParadaStatus(p)==="pendente"&&(
                      <span style={{display:"inline-block",color:OTIMIZAR_LARANJA,fontSize:12,fontWeight:500}}>
                        📦 {resumoPacotesLabel(p)}
                      </span>
                    )}
                  </div>
                  {getParadaStatus(p)==="concluida"&&<div style={{color:C.green,fontSize:11,marginTop:4}}>✅ Concluída · {p.horario||""}</div>}
                  {getParadaStatus(p)==="entregue"&&<div style={{color:C.green,fontSize:11,marginTop:4}}>✅ Entregue · {p.horario||""}</div>}
                  {getParadaStatus(p)==="nao_entregue"&&<div style={{color:C.red,fontSize:11,marginTop:4}}>❌ {p.motivo||"Não entregue"}</div>}
                </div>
              </div>
              {String(editNumId)===String(p.id)&&(
                <div onClick={e=>e.stopPropagation()} style={{display:"flex",flexDirection:"column",gap:6,paddingLeft:34,marginTop:2}}>
                  {migrateParada(p).pacotes.map((pk,pi)=>(
                    <div key={pk.id} style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{color:C.muted,fontSize:12,minWidth:64,flexShrink:0}}>Pacote {pi+1}</span>
                      <input type="text" inputMode="numeric" autoComplete="off"
                        value={pk.numero||""}
                        onChange={e=>setPacoteNumero(p.id,pk.id,e.target.value)}
                        placeholder="Nº do pacote"
                        style={{flex:1,minWidth:0,background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:8,color:C.text,padding:"7px 10px",fontSize:13,outline:"none",boxSizing:"border-box"}}
                      />
                    </div>
                  ))}
                  <button type="button" onClick={()=>setEditNumId(null)}
                    style={{alignSelf:"flex-start",background:OTIMIZAR_AZUL,border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",color:"#fff",fontSize:12,fontWeight:700}}>
                    ✓ Concluir
                  </button>
                </div>
              )}
              <button onClick={(e)=>{e.stopPropagation();setParadaRemover(p.id);}}
                style={{position:"absolute",top:10,right:10,background:C.redLight,border:"none",borderRadius:7,padding:5,cursor:"pointer",color:C.red,display:"flex",flexShrink:0}}>
                <Trash2Icon size={13}/>
              </button>
              {p.geocodeFalhou&&(
                <div style={{color:"#92400E",fontSize:11,fontWeight:700,paddingLeft:34,marginTop:-4}}>
                  ⚠️ Confirme este endereço antes de otimizar
                </div>
              )}
              {/* V232 — outlier: muito distante do centro das paradas; exige confirmação */}
              {p.outlier&&(
                <div style={{paddingLeft:34,marginTop:-4,display:"flex",flexDirection:"column",gap:7,alignItems:"flex-start"}}>
                  <div style={{color:"#92400E",fontSize:11,fontWeight:700,lineHeight:1.4}}>
                    ⚠️ Endereço muito distante das demais paradas — confirme a cidade antes de otimizar
                  </div>
                  <button onClick={(e)=>{e.stopPropagation();setParadas(prev=>prev.map(x=>x.id===p.id?{...x,outlier:false,outlierConfirmado:true}:x));}}
                    style={{background:"#FFFBEB",border:`1.5px solid ${C.amber}`,borderRadius:8,padding:"5px 11px",cursor:"pointer",color:"#92400E",fontSize:11,fontWeight:700}}>
                    ✓ Manter mesmo assim
                  </button>
                </div>
              )}
              {!p.geocodeFalhou&&!p.outlier&&p.confianca==="warn"&&getParadaStatus(p)==="pendente"&&(
                <div style={{color:"#92400E",fontSize:11,fontWeight:600,paddingLeft:34,marginTop:-4}}>
                  ⚠️ Verifique este endereço
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Erro otimização */}
      {erroOtimizar&&(
        <div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",marginBottom:12,color:"#DC2626",fontSize:13,fontWeight:600}}>
          ⚠️ {erroOtimizar}
        </div>
      )}

      {/* V231/V233 — GPS indisponível: rota parte da primeira parada (não trava o fluxo) */}
      {avisoGps&&(
        <div style={{background:"#FFFBEB",border:"1.5px solid #FDE68A",borderRadius:10,padding:"10px 13px",marginBottom:12,color:"#92400E",fontSize:13,fontWeight:700}}>
          {avisoGps}
        </div>
      )}

      {/* V233 — bloco da Directions sem desenho após retry (ordem não é afetada) */}
      {avisoTrajeto&&(
        <div style={{background:"#EFF6FF",border:"1.5px solid #BFDBFE",borderRadius:10,padding:"10px 13px",marginBottom:12,color:"#1D4ED8",fontSize:12,fontWeight:600}}>
          🗺️ {avisoTrajeto}
        </div>
      )}

      {/* V233 — toast discreto de pacotes agrupados */}
      {avisoAgrupado&&(
        <div style={{background:"#F0FDF4",border:"1.5px solid #BBF7D0",borderRadius:10,padding:"10px 13px",marginBottom:12,color:"#15803D",fontSize:12,fontWeight:600}}>
          {avisoAgrupado}
        </div>
      )}

      {/* Botão otimizar */}
      {paradas.length>=2&&!resultado&&(
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
          <button onClick={handleOtimizarRota}
            style={{width:"100%",padding:"15px",background:otimizando?"#94A3B8":`linear-gradient(135deg,${OTIMIZAR_AZUL},${OTIMIZAR_AZUL_MID})`,border:"none",borderRadius:14,cursor:otimizando?"not-allowed":"pointer",color:"#fff",fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:9,boxShadow:`0 4px 20px ${OTIMIZAR_AZUL}44`}}>
            {otimizando
              ?<><span style={{fontSize:16}}>⏳</span> Calculando rota perfeita...</>
              :aposConclusao
                ?<><RouteIcon size={18}/> Nova Rota</>
                :<><ZapIcon size={18}/> Otimizar Rota Perfeita</>}
          </button>
          <button onClick={handleUsarRotaComoEsta} disabled={otimizando}
            style={{width:"100%",padding:"13px",background:"#fff",border:`1.5px solid ${OTIMIZAR_AZUL}`,borderRadius:14,cursor:otimizando?"not-allowed":"pointer",color:OTIMIZAR_AZUL,fontWeight:800,fontSize:14,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            📋 Usar rota como está
          </button>
        </div>
      )}

      {/* Resultado da otimização — V233: card de economia nunca fica mudo */}
      {resultado&&(
        <div ref={resultadoRef} style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
          {/* Banner economia — > 0,1 km mostra ganho; senão "rota já ideal" */}
          <div style={{background:`linear-gradient(135deg,${OTIMIZAR_AZUL},${OTIMIZAR_AZUL_MID})`,borderRadius:16,padding:"18px 20px",textAlign:"center",boxShadow:`0 4px 16px ${OTIMIZAR_AZUL}44`}}>
            {resultado.semOtimizacao?(
              <>
                <div style={{fontSize:32,marginBottom:6}}>📋</div>
                <div style={{color:"#fff",fontWeight:900,fontSize:18,fontFamily:"'Sora',sans-serif",marginBottom:4}}>
                  Rota na ordem que você adicionou
                </div>
                <div style={{color:"rgba(255,255,255,0.85)",fontSize:13}}>
                  Sem otimização — as paradas seguem a ordem original
                </div>
              </>
            ):resultado.rotaJaIdeal||!(Number(resultado.economiaKm)>0)?(
              <>
                <div style={{fontSize:32,marginBottom:6}}>✅</div>
                <div style={{color:"#fff",fontWeight:900,fontSize:18,fontFamily:"'Sora',sans-serif"}}>
                  Sua rota já estava no caminho ideal
                </div>
              </>
            ):(
              <>
                <div style={{fontSize:32,marginBottom:6}}>🎉</div>
                <div style={{color:"#fff",fontWeight:900,fontSize:18,fontFamily:"'Sora',sans-serif",marginBottom:4}}>
                  Rota otimizada! Você economizou {formatKmDecimal(resultado.economiaKm)}
                </div>
                <div style={{color:"rgba(255,255,255,0.85)",fontSize:13}}>
                  Equivale a <b>{formatMoeda(resultado.economiaCusto||0)}</b> de combustível a menos
                </div>
              </>
            )}
          </div>

          {/* Detalhes */}
          {detalheRows.length>0&&(
            <div style={{background:C.subtle,borderRadius:14,padding:"16px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{color:C.navy,fontWeight:700,fontSize:13,marginBottom:4}}>📊 Resumo da Rota{resultado.semOtimizacao?"":" Otimizada"}</div>
              {detalheRows.map((r,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:i<detalheRows.length-1?`1px solid ${C.border}`:"none",paddingBottom:i<detalheRows.length-1?8:0}}>
                  <span style={{color:C.text2,fontSize:13}}>{r.emoji} {r.label}</span>
                  <span style={{color:r.cor||C.navy,fontWeight:700,fontSize:14}}>{r.valor}</span>
                </div>
              ))}
            </div>
          )}

          {/* Iniciar navegação embutida */}
          <button onClick={iniciarNavegacao}
            style={{width:"100%",padding:"16px",background:`linear-gradient(135deg,${OTIMIZAR_AZUL},${OTIMIZAR_AZUL_MID})`,border:"none",borderRadius:14,cursor:"pointer",color:"#fff",fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:9,boxShadow:`0 4px 20px ${OTIMIZAR_AZUL}44`}}>
            <NavigationIcon size={20}/> {pendentesCount<paradas.length?"Continuar Navegação":"Iniciar Navegação"}
          </button>

          {/* V287 — ordem de carregamento (carregar o veículo) */}
          <button onClick={()=>setShowOrdemCarga(true)}
            style={{width:"100%",padding:"13px",background:"#EEF4FF",border:`1.5px solid ${OTIMIZAR_AZUL}`,borderRadius:12,cursor:"pointer",color:OTIMIZAR_AZUL,fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            📦 Ordem de carregamento
          </button>

          {/* Refazer */}
          <button onClick={()=>setConfirmNovaOtimizacao(true)}
            style={{width:"100%",padding:"12px",background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:12,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:13}}>
            🔄 {resultado.semOtimizacao?"Recomeçar":"Nova otimização"}
          </button>
        </div>
      )}

      {/* Histórico de entregas — botão para tela dedicada */}
      {!modoNavegacao&&!showResumo&&!showHistoricoEntregas&&(
        <button type="button" onClick={()=>{carregarHistorico();setShowHistoricoEntregas(true);}}
          style={{width:"100%",padding:"13px 16px",marginBottom:14,background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:12,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <span style={{color:C.navy,fontWeight:700,fontSize:14}}>📋 Histórico de Entregas</span>
          <span style={{color:OTIMIZAR_AZUL,fontSize:13,fontWeight:800}}>▶</span>
        </button>
      )}

      {/* V233 — espaço extra: a barra fixa "Navegação em andamento" não pode cobrir conteúdo */}
      {Boolean(resultado)&&pendentesCount>0&&!modoNavegacao&&(
        <div style={{height:"calc(76px + env(safe-area-inset-bottom))"}}/>
      )}

      {showResumo&&resumoFinal&&(
        <div style={{position:"fixed",inset:0,zIndex:680,background:C.surface,display:"flex",flexDirection:"column",padding:"20px 16px",overflowY:"auto"}}>
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:48,marginBottom:8}}>🏁</div>
            <div style={{color:C.navy,fontWeight:900,fontSize:20,fontFamily:"'Sora',sans-serif"}}>Rota concluída!</div>
            {salvandoRota&&<div style={{color:C.muted,fontSize:12,marginTop:6}}>Salvando no histórico…</div>}
            {!salvandoRota&&!erroHistoricoSave&&uid&&rotaSalvaId&&<div style={{color:C.green,fontSize:12,marginTop:6}}>✅ Salvo no histórico</div>}
            {!salvandoRota&&erroHistoricoSave&&rotaSalvaId&&<div style={{color:C.amber,fontSize:12,marginTop:6,fontWeight:600}}>{erroHistoricoSave}</div>}
            {!salvandoRota&&erroHistoricoSave&&!rotaSalvaId&&<div style={{color:C.red,fontSize:12,marginTop:6,fontWeight:600}}>{erroHistoricoSave}</div>}
          </div>
          <div style={{background:C.subtle,borderRadius:14,padding:16,marginBottom:16}}>
            {[
              {label:"Total de paradas",valor:resumoFinal.total},
              {label:"Entregues",valor:resumoFinal.entregues,cor:C.green},
              {label:"Não entregues",valor:resumoFinal.naoEntregues,cor:C.red},
            ].map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:i<2?`1px solid ${C.border}`:"none"}}>
                <span style={{color:C.text2,fontSize:14}}>{r.label}</span>
                <span style={{color:r.cor||C.navy,fontWeight:800,fontSize:15}}>{r.valor}</span>
              </div>
            ))}
          </div>
          {resumoFinal.naoEntregues>0&&(
            <div style={{marginBottom:16}}>
              <div style={{color:C.navy,fontWeight:700,fontSize:13,marginBottom:8}}>Motivos</div>
              {resumoFinal.motivos.map(p=>(
                <div key={`${p.id}-${p.pacote||""}`} style={{fontSize:12,color:C.text2,marginBottom:6,padding:"8px 10px",background:"#FFF5F5",borderRadius:8}}>
                  {p.endereco}{p.pacote?` — ${p.pacote}`:""} — <b>{p.motivo}</b>
                </div>
              ))}
            </div>
          )}
          <button onClick={reiniciarRota} style={{width:"100%",padding:14,background:`linear-gradient(135deg,${OTIMIZAR_AZUL},${OTIMIZAR_AZUL_MID})`,border:"none",borderRadius:12,color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer"}}>
            Nova Rota
          </button>
          <button onClick={()=>{reiniciarRota();onClose();}} style={{width:"100%",padding:12,marginTop:10,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",color:C.text2,fontWeight:600}}>
            Fechar
          </button>
        </div>
      )}

      {/* Navegação embutida */}
      {modoNavegacao&&paradaAtual&&(
        <div style={{position:"fixed",inset:0,zIndex:700,background:"#fff",display:"flex",flexDirection:"column"}}>
          {viewNav==="mapa"?(
            <>
              <div style={{position:"relative",flex:1,minHeight:0}}>
                <NavigationMap
                  paradas={paradasDedup}
                  currentStopIndex={paradaAtualIdx}
                  originCoords={posicaoMotorista}
                  height="100%"
                  onDriverLocationUpdate={setPosicaoMotorista}
                  onVerPacotes={abrirPacotesTela}
                />
                <button type="button" onClick={()=>setShowConfirmExitNav(true)} aria-label="Pausar navegação"
                  style={{position:"absolute",top:12,right:12,zIndex:20,width:40,height:40,borderRadius:"50%",background:"#fff",border:"none",boxShadow:"0 2px 10px rgba(0,0,0,0.22)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <XIcon size={18} color={C.muted}/>
                </button>
                {reotimizando&&(
                  <div style={{position:"absolute",top:12,left:12,zIndex:20,background:"rgba(255,255,255,0.92)",borderRadius:10,padding:"6px 12px",fontSize:12,fontWeight:600,color:OTIMIZAR_AZUL}}>
                    Reotimizando rota…
                  </div>
                )}
              </div>
              <div style={{padding:"12px 16px",borderTop:`1px solid ${C.border}`,background:C.subtle,flexShrink:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{color:C.muted,fontSize:11,fontWeight:700}}>Próxima parada</span>
                  <span style={{color:OTIMIZAR_AZUL,fontSize:12,fontWeight:800}}>{paradaAtualIdx+1} de {paradasDedup.length}</span>
                </div>
                <div style={{color:C.text,fontSize:14,fontWeight:600,lineHeight:1.4,marginBottom:8}}>{paradaAtual.endereco}</div>
                {migrateParada(paradaAtual).pacotes.length>1&&(
                  <div style={{marginBottom:10}}>
                    <div style={{color:OTIMIZAR_AZUL,fontSize:11,fontWeight:700,marginBottom:8,padding:"6px 10px",background:"#EEF4FF",borderRadius:8}}>
                      📦 {resumoPacotesLabel(paradaAtual)}
                    </div>
                    <button type="button" onClick={()=>abrirPacotesTela(paradaAtual.id)}
                      style={{width:"100%",padding:"10px 12px",background:"#EEF4FF",border:`1.5px solid ${OTIMIZAR_AZUL}`,borderRadius:10,cursor:"pointer",color:OTIMIZAR_AZUL,fontWeight:800,fontSize:13}}>
                      📦 Ver pacotes
                    </button>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:8,marginBottom:0}}>
                  <button type="button" onClick={()=>openGoogleMapsNavigationToStop(paradaAtual)}
                    style={{padding:"12px 10px",background:OTIMIZAR_AZUL,border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:800,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    🗺️ Navegar
                  </button>
                  <button type="button" onClick={()=>{resetNavAddForm();setShowAddNavMenu(true);}}
                    style={{padding:"12px 10px",background:"#fff",border:`2px solid ${OTIMIZAR_AZUL}`,borderRadius:12,cursor:"pointer",color:OTIMIZAR_AZUL,fontWeight:800,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                    ➕ Nova parada
                  </button>
                </div>
                <button type="button" onClick={()=>setShowOrdemCarga(true)}
                  style={{marginTop:8,width:"100%",padding:"10px",background:"#EEF4FF",border:`1.5px solid ${OTIMIZAR_AZUL}`,borderRadius:10,cursor:"pointer",color:OTIMIZAR_AZUL,fontWeight:800,fontSize:13}}>
                  📦 Ordem de carregamento
                </button>
              </div>
            </>
          ):(
            <div style={{position:"relative",flex:1,minHeight:0,overflowY:"auto",padding:14,paddingTop:56}}>
              <button type="button" onClick={()=>setShowConfirmExitNav(true)} aria-label="Pausar navegação"
                style={{position:"absolute",top:12,right:12,zIndex:20,width:40,height:40,borderRadius:"50%",background:"#fff",border:"none",boxShadow:"0 2px 10px rgba(0,0,0,0.22)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <XIcon size={18} color={C.muted}/>
              </button>
              {paradasDedup.map((p,i)=>{
                const expandida=listaExpandidaIds.has(p.id);
                const st=getParadaStatus(p);
                const multi=countPacotes(p)>1;
                return(
                <div key={`parada-${p.id}`} role={multi?undefined:"button"} tabIndex={multi?undefined:0}
                  onClick={multi?undefined:()=>toggleListaExpand(p.id)}
                  onKeyDown={multi?undefined:e=>{if(e.key==="Enter"||e.key===" ")toggleListaExpand(p.id);}}
                  style={{
                  padding:"10px 11px",marginBottom:8,borderRadius:11,cursor:multi?"default":"pointer",
                  background:paradaCardBg(p),
                  border:`1.5px solid ${paradaCardBorder(p,i,paradaAtualIdx,true)}`,
                }}>
                  <div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,minWidth:44,flexShrink:0}}>
                      <span style={{width:30,height:30,borderRadius:"50%",background:OTIMIZAR_AZUL_MID,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,flexShrink:0}}>{i+1}</span>
                      {etasParadas[i]&&etasParadas[i]!=="—"&&(
                        <span style={{fontSize:11,fontWeight:600,color:"#6B7280",lineHeight:1.2}}>
                          {etasParadas[i]}
                        </span>
                      )}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:C.text,fontSize:13,lineHeight:1.4}}>{p.endereco}</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:12,rowGap:6,marginTop:6,alignItems:"center"}}>
                        {pacotesNumerosLabel(p)&&(
                          <div style={{display:"inline-block",background:"#fff",border:`1px solid ${OTIMIZAR_LARANJA}`,borderRadius:10,padding:"2px 8px",color:OTIMIZAR_LARANJA,fontSize:12,fontWeight:500}}>
                            📦 {pacotesNumerosLabel(p)}
                          </div>
                        )}
                        <div style={{color:OTIMIZAR_LARANJA,fontSize:12,fontWeight:500}}>📦 {resumoPacotesLabel(p)}</div>
                      </div>
                      {st==="concluida"&&<div style={{color:C.green,fontSize:11,marginTop:4}}>✅ Concluída · {p.horario}</div>}
                      {st==="entregue"&&<div style={{color:C.green,fontSize:11,marginTop:4}}>✅ Entregue · {p.horario}</div>}
                      {st==="nao_entregue"&&<div style={{color:C.red,fontSize:11,marginTop:4}}>❌ {p.motivo}</div>}
                      {i===paradaAtualIdx&&st==="pendente"&&<div style={{color:OTIMIZAR_AZUL,fontSize:11,fontWeight:700,marginTop:4}}>→ Parada atual</div>}
                    </div>
                    {!multi&&<span style={{color:C.muted,fontSize:14,fontWeight:700,flexShrink:0}}>{expandida?"▾":"▸"}</span>}
                  </div>
                  {multi&&(
                    <button type="button" onClick={()=>abrirPacotesTela(p.id)}
                      style={{width:"100%",marginTop:10,padding:"10px 12px",background:"#EEF4FF",border:`1.5px solid ${OTIMIZAR_AZUL}`,borderRadius:10,cursor:"pointer",color:OTIMIZAR_AZUL,fontWeight:800,fontSize:13}}>
                      📦 Ver pacotes
                    </button>
                  )}
                  {!multi&&expandida&&st==="pendente"&&(
                    <div onClick={e=>e.stopPropagation()}>
                      <PacotesParadaRows
                        parada={p}
                        paradaId={p.id}
                        onEntregue={aplicarMarcarPacote}
                        onNaoEntregue={handlePacoteNaoEntregue}
                        compact
                      />
                    </div>
                  )}
                  {!multi&&expandida&&st!=="pendente"&&(
                    <div style={{marginTop:8}} onClick={e=>e.stopPropagation()}>
                      {(migrateParada(p).pacotes||[]).map((pk,j)=>(
                        <div key={pk.id} style={{fontSize:11,color:C.text2,marginBottom:4}}>
                          📦 {pacoteDisplayName(pk,j)} — {pk.status==="entregue"?"✅ Entregue":pk.status==="nao_entregue"?`❌ ${pk.motivoNaoEntrega||"Não entregue"}`:"Pendente"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );})}
            </div>
          )}
          <div style={{padding:"12px 16px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,paddingBottom:"max(12px, env(safe-area-inset-bottom))",borderTop:`1px solid ${C.border}`,background:"#fff",flexShrink:0}}>
            <button type="button" onClick={handleNavEntregue}
              style={{padding:"14px 6px",background:"#DCFCE7",border:"2px solid #22C55E",borderRadius:14,cursor:"pointer",color:"#15803D",fontWeight:800,fontSize:13}}>
              ✅ Entregue
            </button>
            <button type="button" onClick={handleNavNaoEntregue}
              style={{padding:"14px 6px",background:"#FEE2E2",border:"2px solid #DC2626",borderRadius:14,cursor:"pointer",color:"#B91C1C",fontWeight:800,fontSize:13}}>
              ❌ Não entregue
            </button>
            <button type="button" onClick={()=>setViewNav(v=>v==="mapa"?"lista":"mapa")}
              style={{padding:"14px 6px",background:"#fff",border:`2px solid ${OTIMIZAR_AZUL}`,borderRadius:14,cursor:"pointer",color:OTIMIZAR_AZUL,fontWeight:800,fontSize:13}}>
              📋 {viewNav==="mapa"?"Ver Lista":"Ver Mapa"}
            </button>
          </div>
        </div>
      )}

      {/* V287 — Ordem de carregamento (lista inversa da entrega) */}
      {showOrdemCarga&&(
        <div style={{position:"fixed",inset:0,zIndex:760,background:C.surface,display:"flex",flexDirection:"column"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{color:C.navy,fontWeight:900,fontSize:18,fontFamily:"'Sora',sans-serif"}}>📦 Ordem de carregamento</div>
            <button type="button" onClick={()=>setShowOrdemCarga(false)} aria-label="Fechar"
              style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:9,padding:8,cursor:"pointer",color:C.muted,display:"flex"}}>
              <XIcon size={18}/>
            </button>
          </div>
          <div style={{padding:"14px 16px",background:"#EEF4FF",borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
            <div style={{color:"#1E3A8A",fontSize:14,fontWeight:700,lineHeight:1.5}}>
              Carregue nesta ordem: o pacote da última entrega entra primeiro e fica no fundo.
            </div>
          </div>
          <div style={{flex:1,minHeight:0,overflowY:"auto",padding:"14px 16px"}}>
            {[...paradasDedup].reverse().map((p,i)=>{
              const entregaPos=paradasDedup.length-i;
              const nums=pacotesNumerosLabel(p);
              return(
                <div key={`carga-${p.id}`} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 12px",marginBottom:10,background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:14}}>
                  <div style={{width:56,height:56,borderRadius:14,background:`linear-gradient(135deg,${OTIMIZAR_AZUL},${OTIMIZAR_AZUL_MID})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    <span style={{color:"#fff",fontWeight:900,fontSize:26,fontFamily:"'Sora',sans-serif"}}>{i+1}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:C.text,fontSize:15,fontWeight:700,lineHeight:1.35}}>{p.endereco}</div>
                    {nums&&(
                      <div style={{display:"inline-block",marginTop:6,background:"#EEF4FF",border:`1px solid ${OTIMIZAR_AZUL}`,borderRadius:6,padding:"2px 8px",color:OTIMIZAR_AZUL,fontSize:13,fontWeight:800}}>
                        📦 {nums}
                      </div>
                    )}
                    <div style={{color:C.muted,fontSize:12,marginTop:6}}>Entrega nº {entregaPos}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{padding:"12px 16px",paddingBottom:"max(12px, env(safe-area-inset-bottom))",borderTop:`1px solid ${C.border}`,flexShrink:0}}>
            <button type="button" onClick={()=>setShowOrdemCarga(false)}
              style={{width:"100%",padding:"14px",background:OTIMIZAR_AZUL,border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:800,fontSize:15}}>
              Entendi
            </button>
          </div>
        </div>
      )}

      {showHistoricoEntregas&&(
        <HistoricoEntregasScreen
          onBack={()=>setShowHistoricoEntregas(false)}
          uid={uid}
          rotas={historicoEntregas}
          onReload={carregarHistorico}
          abertoId={historicoAbertoId}
          setAbertoId={setHistoricoAbertoId}
          onGerarPdf={handleGerarPdf}
          gerandoPdf={gerandoPdf}
          reportFromHistorico={reportFromHistorico}
        />
      )}

      {showConfirmExitNav&&(
        <div style={{position:"fixed",inset:0,zIndex:720,background:"#1E3A8A66",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:360,padding:24,boxShadow:"0 12px 40px #00000033",textAlign:"center"}}>
            <div style={{color:C.navy,fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif",marginBottom:8}}>Deseja pausar a navegação?</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:20,lineHeight:1.5}}>Você voltará ao Otimizador. Seu progresso será mantido e poderá retomar pelo banner.</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button type="button" onClick={pausarNavegacao}
                style={{width:"100%",padding:13,background:OTIMIZAR_AZUL,border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14}}>
                Sim, pausar
              </button>
              <button type="button" onClick={()=>setShowConfirmExitNav(false)}
                style={{width:"100%",padding:13,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:14}}>
                Não, continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {showMotivo&&createPortal(
        <div style={{position:"fixed",inset:0,zIndex:810,background:"#1E3A8A66",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:16}}>
          <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:420,padding:20}}>
            <div style={{color:C.navy,fontWeight:800,fontSize:16,marginBottom:14}}>Motivo da não entrega</div>
            {MOTIVOS_NAO_ENTREGUE.map(m=>(
              <button key={m} type="button" onClick={()=>{
                if(motivoPacoteTarget){
                  aplicarMarcarPacote(motivoPacoteTarget.paradaId,motivoPacoteTarget.pacoteId,"nao_entregue",m);
                }
              }}
                style={{width:"100%",textAlign:"left",padding:"12px 14px",marginBottom:8,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:10,cursor:"pointer",color:C.text,fontWeight:600,fontSize:14}}>
                {m}
              </button>
            ))}
            <button type="button" onClick={()=>{setShowMotivo(false);setMotivoPacoteTarget(null);}} style={{width:"100%",padding:10,marginTop:4,background:"transparent",border:"none",cursor:"pointer",color:C.muted}}>Cancelar</button>
          </div>
        </div>,
        document.body
      )}

      {pacotesTelaParadaViva&&pacotesTelaParadaId!=null&&createPortal(
        <PacotesParadaTela
          paradaViva={pacotesTelaParadaViva}
          paradaNum={pacotesTelaParadaNum}
          paradaId={pacotesTelaParadaId}
          onVoltar={()=>setPacotesTelaParadaId(null)}
          onEntregue={aplicarMarcarPacote}
          onNaoEntregue={handlePacoteNaoEntregue}
        />,
        document.body
      )}

      {showAddNavMenu&&(
        <div style={{position:"fixed",inset:0,zIndex:760,background:"#1E3A8A66",display:"flex",alignItems:"flex-end",justifyContent:"center",padding:16}} onMouseDown={e=>{if(e.target===e.currentTarget){setShowAddNavMenu(false);resetNavAddForm();}}}>
          <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:420,padding:20,maxHeight:"80vh",overflowY:"auto"}}>
            <div style={{color:C.navy,fontWeight:800,fontSize:16,marginBottom:12}}>Adicionar parada</div>
            {erroNavAdd&&<div style={{color:C.red,fontSize:12,marginBottom:10}}>{erroNavAdd}</div>}
            <ScannerModule
              disabled={adicionandoNav||reotimizando}
              maxToAdd={1}
              isPro={isPago}
              onSuccess={handleNavScannerSuccess}
              onError={setErroNavAdd}
              onProcessingChange={setAdicionandoNav}
              accentColor={OTIMIZAR_AZUL}
              accentDark={OTIMIZAR_AZUL_MID}
              accentLight="#EEF4FF"
              accentBorder="#BFDBFE"
            />
            <div style={{marginTop:12}}>
              <EnderecoPacotesForm
                endereco={novoEnderecoNav} setEndereco={setNovoEnderecoNav}
                destinatario={novoDestinatarioNav} setDestinatario={setNovoDestinatarioNav}
                pacoteNum={novoPacoteNumNav} setPacoteNum={setNovoPacoteNumNav}
                extrasNomes={pacotesExtrasNomesNav} setExtrasNomes={setPacotesExtrasNomesNav}
                extrasNums={pacotesExtrasNumsNav} setExtrasNums={setPacotesExtrasNumsNav}
                onSubmit={handleNavManualAdd}
                submitLabel="Adicionar manual"
                submitting={adicionandoNav}
                disabled={reotimizando}
                addressPlaceholder="Digitar endereço manualmente"
                onErro={setErroNavAdd}
              />
            </div>
            <button type="button" onClick={()=>{setShowAddNavMenu(false);resetNavAddForm();}} style={{width:"100%",padding:10,marginTop:10,background:C.subtle,border:"none",borderRadius:10,cursor:"pointer",color:C.muted}}>Fechar</button>
          </div>
        </div>
      )}

      {/* V232 — nova parada durante a rota: re-otimizar pendentes ou adicionar ao fim */}
      {showInsertOpcoes&&paradaPendenteInsert&&(
        <div style={{position:"fixed",inset:0,zIndex:770,background:"#1E3A8A66",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:380,padding:22}}>
            <div style={{color:C.navy,fontWeight:800,fontSize:15,marginBottom:8}}>Re-otimizar as paradas restantes incluindo a nova?</div>
            <div style={{color:C.muted,fontSize:12,marginBottom:14,lineHeight:1.4}}>{paradaPendenteInsert.endereco}</div>
            {[
              {id:"eficiente",label:"🔄 Re-otimizar",desc:"Recalcula a melhor ordem das paradas pendentes a partir do seu GPS. Entregas já feitas não mudam."},
              {id:"final",label:"➕ Adicionar ao fim",desc:"Entra como última parada da lista"},
            ].map(op=>(
              <button key={op.id} type="button" disabled={reotimizando} onClick={()=>aplicarInsertParada(op.id,{...paradaPendenteInsert,id:paradaPendenteInsert.id||Date.now()})}
                style={{width:"100%",textAlign:"left",padding:"12px 14px",marginBottom:8,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:10,cursor:reotimizando?"wait":"pointer"}}>
                <div style={{color:C.text,fontWeight:700,fontSize:14}}>{op.label}</div>
                <div style={{color:C.muted,fontSize:11,marginTop:2}}>{op.desc}</div>
              </button>
            ))}
            {reotimizando&&<div style={{color:OTIMIZAR_AZUL,fontSize:12,fontWeight:600,textAlign:"center",marginTop:4}}>Reotimizando rota…</div>}
            <button type="button" onClick={()=>{setShowInsertOpcoes(false);setParadaPendenteInsert(null);}} style={{width:"100%",padding:10,marginTop:4,background:"transparent",border:"none",cursor:"pointer",color:C.muted}}>Cancelar</button>
          </div>
        </div>
      )}

      {/* V233 — duplicado durante a rota: adicionar pacote à parada pendente */}
      {dupQueue.length>0&&(
        <div style={{position:"fixed",inset:0,zIndex:790,background:"#1E3A8A66",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:360,padding:24,textAlign:"center"}}>
            <div style={{fontSize:34,marginBottom:8}}>📦</div>
            <div style={{color:C.navy,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif",marginBottom:8}}>
              Este endereço já está na rota (parada {dupQueue[0].idx+1})
            </div>
            <div style={{color:C.muted,fontSize:13,marginBottom:18,lineHeight:1.5}}>{dupQueue[0].parada.endereco}</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button type="button" onClick={confirmarPacoteNaParada}
                style={{width:"100%",padding:"13px 0",background:OTIMIZAR_AZUL,border:"none",borderRadius:11,cursor:"pointer",color:"#fff",fontWeight:800,fontSize:14}}>
                ➕ Adicionar pacote a essa parada
              </button>
              <button type="button" onClick={cancelarPacoteNaParada}
                style={{width:"100%",padding:"12px 0",background:C.subtle,border:`1px solid ${C.border}`,borderRadius:11,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:14}}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {showPdfShare&&pdfReportData&&createPortal(
        <div style={{position:"fixed",inset:0,zIndex:2500,background:"#1E3A8A66",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:360,padding:24,boxShadow:"0 12px 40px #00000033",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:8}}>📄</div>
            <div style={{color:C.navy,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif",marginBottom:8}}>PDF gerado!</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:18,lineHeight:1.5}}>Compartilhe o relatório:</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button type="button" onClick={()=>shareDeliveryReportWhatsApp(pdfReportData)}
                style={{width:"100%",padding:13,background:"#25D366",border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14}}>
                WhatsApp (texto)
              </button>
              {pdfBlobCache&&(
                <button type="button" onClick={async()=>{
                  try{await sharePdfFileViaSystem(pdfBlobCache,pdfFilenameCache||"relatorio.pdf");}
                  catch{shareDeliveryReportWhatsApp(pdfReportData);}
                }}
                  style={{width:"100%",padding:13,background:"#128C7E",border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14}}>
                WhatsApp / compartilhar PDF
              </button>
              )}
              <button type="button" onClick={()=>shareDeliveryReportEmail(pdfReportData)}
                style={{width:"100%",padding:13,background:C.navy,border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14}}>
                E-mail
              </button>
              <button type="button" onClick={()=>{setShowPdfShare(false);setPdfReportData(null);setPdfBlobCache(null);setPdfFilenameCache("");}}
                style={{width:"100%",padding:12,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:14}}>
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {paradaRemover!=null&&(
        <ConfirmDialog
          message="Remover esta parada da rota?"
          confirmLabel="Remover"
          onCancel={()=>setParadaRemover(null)}
          onConfirm={()=>{removerParada(paradaRemover);setParadaRemover(null);}}
        />
      )}
      {confirmNovaOtimizacao&&(
        <ConfirmDialog
          message="Tem certeza? Isso vai apagar todos os endereços e começar do zero."
          confirmLabel="Sim"
          onCancel={()=>setConfirmNovaOtimizacao(false)}
          onConfirm={reiniciarRota}
        />
      )}
      {confirmLimpar&&(
        <ConfirmDialog
          message={`Tem certeza? Todas as ${paradas.length} paradas serão apagadas.`}
          confirmLabel="Limpar tudo"
          onCancel={()=>setConfirmLimpar(false)}
          onConfirm={()=>{seqRef.current=0;setParadas([]);setResultado(null);setHorarioBaseMs(null);setConfirmLimpar(false);}}
        />
      )}
    </ModalWrap>
  );
};

// ── CALCULADORA DE VIAGEM (V171 — Google Directions + pedágio em R$ + voz) ─
const TripCalcModal=({onClose,vehicles,onConcluido,onGoMeuVeiculo})=>{
  const TRIP_VEHICLES=[
    {id:"moto",   emoji:"🏍️", label:"Moto",         consumption:25, axles:2, electric:false},
    {id:"carro",  emoji:"🚗",  label:"Carro",         consumption:12, axles:2, electric:false},
    {id:"eletric",emoji:"🚙",  label:"Carro Elétrico",consumption:0,  axles:2, electric:true, kwh:0.20},
  ];
  const nid=useRef(10);
  const[stops,setStops]=useState([{id:1,v:"",coords:null},{id:2,v:"",coords:null}]);
  const[distancia,setDistancia]=useState("");
  const[tempoEstimadoSeg,setTempoEstimadoSeg]=useState(null);
  const[buscandoDist,setBuscandoDist]=useState(false);
  const[vehicleId,setVehicleId]=useState("carro");
  // V235 — seletor de reboque igual à Calculadora de Fretes (substitui o toggle binário)
  const[trailer,setTrailer]=useState("none");
  const[consumo,setConsumo]=useState("");
  const[combustivel,setCombustivel]=useState("");
  const[pedagio,setPedagio]=useState("");
  const[pedagioAuto,setPedagioAuto]=useState(false);
  const pedagioEditadoPeloUsuarioRef=useRef(false);
  const pedagioFetchGenRef=useRef(0);
  const[result,setResult]=useState(null);
  const[erro,setErro]=useState("");
  const[offlineHydrated,setOfflineHydrated]=useState(false);
  const[offlineRestored,setOfflineRestored]=useState(false);

  useEffect(()=>{ warmGeocodeProximity(); }, []);

  useEffect(()=>{
    const cached=readOfflineCache(OFFLINE_KEYS.viagem);
    const temDados=cached&&(
      String(cached.consumo||"").trim()||
      String(cached.combustivel||"").trim()||
      cached.vehicleId
    );
    if(temDados){
      const vid=cached.vehicleId==="eletrico"?"eletric":cached.vehicleId;
      if(vid&&TRIP_VEHICLES.some(v=>v.id===vid))setVehicleId(vid);
      // V235 — compat: cache antigo usava boolean `carretinha` (true = reboque simples)
      if(cached.trailer)setTrailer(cached.trailer);
      else if(cached.carretinha)setTrailer("simples");
      if(cached.consumo!=null)setConsumo(String(cached.consumo));
      if(cached.combustivel!=null)setCombustivel(String(cached.combustivel));
      setOfflineRestored(true);
      setTimeout(()=>setOfflineRestored(false),3500);
    }
    setOfflineHydrated(true);
  },[]);

  useEffect(()=>{
    if(!offlineHydrated)return;
    const temDados=
      String(consumo||"").trim()||
      String(combustivel||"").trim()||
      vehicleId!=="carro";
    if(!temDados)return;
    writeOfflineCache(OFFLINE_KEYS.viagem,{
      vehicleId,trailer,consumo,combustivel,
    });
  },[offlineHydrated,vehicleId,trailer,consumo,combustivel]);

  const aplicarPedagioAuto=async(stopsAtuais)=>{
    if(pedagioEditadoPeloUsuarioRef.current)return null;
    try{
      const out=await buscarPedagioRoutes(stopsAtuais,{travelMode:travelModePedagio(vehicleId)});
      if(out.ok){
        if(out.valorPedagio>0){
          setPedagio(out.formatado);
          setPedagioAuto(true);
          return out.formatado;
        }
        setPedagio("");
        setPedagioAuto(false);
        return "";
      }
      setPedagioAuto(false);
    }catch(err){
      console.error("[LogRotas] Falha ao estimar pedágio (Viagem):",err);
      setPedagioAuto(false);
    }
    return null;
  };

  // V276 — distância + pedágio automáticos com debounce (origem e destino obrigatórios)
  const buscarDistEPedagioAuto=async(stopsAtuais)=>{
    const origem=String(stopsAtuais[0]?.v||"").trim();
    const destino=String(stopsAtuais[stopsAtuais.length-1]?.v||"").trim();
    if(!origem||!destino)return;
    const fetchGen=++pedagioFetchGenRef.current;
    setBuscandoDist(true);
    try{
      const resolvidos=await resolveCalculatorStopsCoords(stopsAtuais);
      const coordsList=resolvidos.map(s=>s.coords);
      const out=await fetchRouteTotalDistanceKm(coordsList);
      if(out.ok&&out.distanceKm!=null){
        setDistancia(String(out.distanceKm));
        setTempoEstimadoSeg(out.durationSeconds??null);
      }else{
        setTempoEstimadoSeg(null);
      }
      setStops(prev=>prev.map((s,i)=>{
        const next=resolvidos[i]?.coords??s.coords;
        const cur=s.coords;
        if(cur&&next&&cur[0]===next[0]&&cur[1]===next[1])return s;
        if(!cur&&!next)return s;
        return{...s,coords:next};
      }));
      if(fetchGen!==pedagioFetchGenRef.current)return;
      await aplicarPedagioAuto(resolvidos);
    }finally{
      if(fetchGen===pedagioFetchGenRef.current)setBuscandoDist(false);
    }
  };

  const stopsEnderecoKey=stops.map(s=>`${s.id}:${String(s.v||"").trim()}`).join("|");
  useEffect(()=>{
    if(!offlineHydrated)return;
    const origem=String(stops[0]?.v||"").trim();
    const destino=String(stops[stops.length-1]?.v||"").trim();
    if(!origem||!destino)return;
    const t=setTimeout(()=>buscarDistEPedagioAuto(stops),800);
    return()=>clearTimeout(t);
  },[stopsEnderecoKey,offlineHydrated,vehicleId,trailer]);

  const veiculo=TRIP_VEHICLES.find(v=>v.id===vehicleId)||TRIP_VEHICLES[1];
  const isElec=veiculo?.electric;
  const showTrailer=vehicleId==="carro"||vehicleId==="eletric";
  const trailerAxles=showTrailer?(trailer==="simples"?1:trailer==="duplo"?2:0):0;
  const TRIP_TRAILER_OPTS=[
    {id:"none",   label:"Sem reboque",    emoji:"🚫",desc:"Sem eixos adicionais"},
    {id:"simples",label:"Reboque simples",emoji:"🔗",desc:"+1 eixo"},
    {id:"duplo",  label:"Reboque duplo",  emoji:"⛓️",desc:"+2 eixos"},
  ];

  const addStop=()=>{
    const dest=stops[stops.length-1];
    setStops(s=>[...s.slice(0,-1),{id:nid.current++,v:"",coords:null},dest]);
  };

  const paradaSearchBias=()=>buildCalculatorStopSearchBias(stops[0]?.v,stops[0]?.coords);

  const calcular=async()=>{
    setErro("");
    const pedagioAutoVal=await aplicarPedagioAuto(stops);
    const pedagioCalc=pedagioAutoVal??pedagio;
    const out=calculateTripCosts({
      distanciaKm:distancia,
      isElec,
      consumo,
      defaultConsumo:veiculo.consumption,
      combustivelPreco:combustivel,
      pedagioTotalReais:pedagioCalc,
      vehicleId,
      vehicleLabel:veiculo.label,
      vehicleAxles:veiculo.axles,
      trailerExtra:trailerAxles,
      custoKmVeiculo:resolveCustoKmSalvo(readCustoVeiculoLocalCache()),
      tempoEstimadoSeg,
    });
    if(!out.ok){setErro(out.error);return;}
    setErro("");
    setResult(out.result);
    onConcluido?.("viagem");
  };

  return(
    <ModalWrap maxW={480}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{color:"#1E3A8A",fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif"}}>🚗 Calculadora de Viagem</div>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>Consulta rápida · Sem salvar</div>
        </div>
        <button onClick={onClose} style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:10,padding:8,cursor:"pointer",color:C.muted,display:"flex"}}><XIcon size={15}/></button>
      </div>
      <OfflineRestoredBanner show={offlineRestored}/>

      <div style={{display:"flex",flexDirection:"column",gap:14}}>

        {/* BLOCO ROTA */}
        <div style={{background:C.subtle,borderRadius:14,padding:"14px 16px",display:"flex",flexDirection:"column",gap:CALC_ROTA_GAP,overflow:"visible"}}>
          <div style={{color:C.navy,fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:0.5,marginBottom:2}}>🗺️ Rota</div>

          {/* Origem */}
          <AddressInput
            value={stops[0]?.v||""}
            onChange={v=>setStops(s=>s.map((x,i)=>i===0?{...x,v,coords:null}:x))}
            onSelect={s=>{
              pedagioEditadoPeloUsuarioRef.current=false;
              setPedagioAuto(false);
              setStops(prev=>prev.map((x,i)=>i===0?{...x,v:s.label,coords:s.coords}:x));
            }}
            placeholder="Origem (opcional)"
            dotColor="#22C55E"
            calc
            enableVoice
            enableMyLocation
          />

          {/* Paradas intermediárias */}
          {stops.slice(1,-1).map((stop,i)=>(
            <div key={stop.id} style={{display:"flex",alignItems:"center",gap:8}}>
              <AddressInput
                value={stop.v}
                onChange={v=>setStops(s=>s.map(x=>x.id===stop.id?{...x,v,coords:null}:x))}
                onSelect={s=>{
                  pedagioEditadoPeloUsuarioRef.current=false;
                  setPedagioAuto(false);
                  setStops(prev=>prev.map(x=>x.id===stop.id?{...x,v:s.label,coords:s.coords}:x));
                }}
                placeholder={`Parada ${i+1}`}
                dotColor={C.orange}
                calc
                enableVoice
                enableMyLocation
                searchOptions={paradaSearchBias}
              />
              <button onClick={()=>setStops(s=>s.filter(x=>x.id!==stop.id))}
                style={{background:C.redLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.red,display:"flex",flexShrink:0}}><Trash2Icon size={12}/></button>
            </div>
          ))}

          {/* Botão adicionar parada — entre origem e destino */}
          <button onClick={addStop}
            style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:"transparent",border:`1.5px dashed #3B82F666`,borderRadius:9,padding:"7px 12px",cursor:"pointer",color:"#3B82F6",fontWeight:600,fontSize:12,width:"100%"}}>
            <PlusCircleIcon size={12}/> + Adicionar parada intermediária
          </button>

          {/* Destino */}
          <AddressInput
            value={stops[stops.length-1]?.v||""}
            onChange={v=>setStops(s=>s.map((x,i)=>i===s.length-1?{...x,v,coords:null}:x))}
            onSelect={s=>{
              pedagioEditadoPeloUsuarioRef.current=false;
              setPedagioAuto(false);
              setStops(prev=>prev.map((x,i)=>i===prev.length-1?{...x,v:s.label,coords:s.coords}:x));
            }}
            placeholder="Destino (opcional)"
            dotColor={C.red}
            calc
            enableVoice
            enableMyLocation
            searchOptions={paradaSearchBias}
          />

          {/* KM total — editável manualmente (fallback) */}
          <div style={{display:"flex",alignItems:"stretch",background:"#fff",border:`1.5px solid ${buscandoDist?"#3B82F6":C.calcBorder}`,borderRadius:10,overflow:"hidden",minHeight:CALC_INPUT_ROW_H}}
            onFocusCapture={e=>e.currentTarget.style.borderColor="#3B82F6"}
            onBlurCapture={e=>e.currentTarget.style.borderColor=C.calcBorder}>
            <input value={distancia} onChange={e=>{setDistancia(e.target.value);setTempoEstimadoSeg(null);}} placeholder={buscandoDist?"Calculando…":"KM total"} type="text" inputMode="decimal"
              style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,...calcFieldInputStyle,fontWeight:700}}/>
            <span style={{padding:"0 10px",color:buscandoDist?"#3B82F6":C.muted,fontSize:12,borderLeft:`1px solid ${C.border}`,background:C.subtle,alignSelf:"stretch",display:"flex",alignItems:"center"}}>{buscandoDist?"🔍":"km"}</span>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <Field label="🏁 Pedágio (R$)" value={pedagio} onChange={v=>{setPedagio(v);setPedagioAuto(false);pedagioEditadoPeloUsuarioRef.current=String(v||"").trim()!=="";}} prefix="R$" calc/>
            {pedagioAuto&&parseNumeroBR(pedagio)>0&&<div style={{color:C.muted,fontSize:11,marginTop:2,textAlign:"center",lineHeight:1.4,paddingBottom:2}}>Estimativa automática — confira o valor da praça.</div>}
          </div>
        </div>

        {/* BLOCO VEÍCULO */}
        <div style={{background:C.subtle,borderRadius:14,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{color:C.navy,fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:0.5}}>🚗 Veículo</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
            {TRIP_VEHICLES.map(v=>{const sel=vehicleId===v.id;return(
              <button key={v.id} onClick={()=>{setVehicleId(v.id);setTrailer("none");setConsumo("");}}
                style={{background:sel?"#EFF6FF":C.surface,border:`2px solid ${sel?"#3B82F6":C.border}`,borderRadius:12,padding:"13px 6px",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                <div style={{fontSize:22,marginBottom:4}}>{v.emoji}</div>
                <div style={{color:sel?"#3B82F6":C.text,fontWeight:700,fontSize:12}}>{v.label}</div>
                {sel&&<div style={{marginTop:4,width:6,height:6,borderRadius:"50%",background:"#3B82F6",margin:"4px auto 0"}}/>}
              </button>
            );})}
          </div>

          {showTrailer&&(
            <TrailerSelector options={TRIP_TRAILER_OPTS} value={trailer} onChange={setTrailer}/>
          )}
        </div>

        {/* BLOCO CUSTOS */}
        <div style={{background:C.subtle,borderRadius:14,padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
          <div style={{color:C.navy,fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:0.5}}>⛽ Custos</div>
          {isElec
            ?<Field label="⚡ Energia (R$/kWh)" value={combustivel} onChange={setCombustivel} prefix="R$" calc/>
            :<Field label="⛽ Combustível (R$/L)" value={combustivel} onChange={setCombustivel} prefix="R$" calc/>}
          <Field label={isElec?"⚡ Consumo (kWh/100km)":"⛽ Consumo (km/L)"} value={consumo} onChange={setConsumo} suffix={isElec?"kWh/100km":"km/L"} calc/>
        </div>

        {/* Erro */}
        {erro&&<div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",color:"#DC2626",fontSize:14,fontWeight:600}}>{erro}</div>}

        {/* Botão calcular */}
        <button onClick={calcular}
          style={{width:"100%",padding:"15px",background:"linear-gradient(135deg,#3B82F6,#2563EB)",border:"none",borderRadius:14,cursor:"pointer",color:"#fff",fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:9,boxShadow:"0 4px 16px #3B82F644"}}>
          <RouteIcon size={17}/> Calcular Viagem
        </button>

        {/* Resultado */}
        {result&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{background:"linear-gradient(135deg,#1E3A8A,#2952C8)",borderRadius:14,padding:"20px 18px",textAlign:"center",boxShadow:"0 4px 16px #1E3A8A44"}}>
              <div style={{color:"#BFDBFE",fontSize:14,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>💸 CUSTO TOTAL DA VIAGEM</div>
              <div style={{color:"#fff",fontWeight:900,fontSize:40,fontFamily:"'Sora',sans-serif",lineHeight:1,marginBottom:4}}>{formatMoeda(result.total||0)}</div>
              <div style={{color:"#93C5FD",fontSize:12}}>{formatKmDecimal(result.dist||0)}</div>
              <div style={{color:"#93C5FD",fontSize:14,fontWeight:600,marginTop:6}}>
                ⏱️ Tempo estimado: {formatDurationApprox(result.tempoEstimadoSeg)||"—"}
              </div>
            </div>
            <div style={{background:"#F8FAFC",borderRadius:14,padding:"14px 16px",display:"flex",flexDirection:"column",gap:0}}>
              {[
                {emoji:isElec?"⚡":"⛽",l:isElec?"Custo energia":"Custo combustível",v:formatMoeda(result.custoComb||0),sub:isElec?`${formatDecimal(result.dist/100*(parseNumeroBR(consumo)||veiculo.kwh),1)} kWh`:`${formatDecimal(result.litros||0,1)} litros · ${formatConsumoKmL(result.cons)}`},
                {emoji:"🏁",l:"Pedágio",v:formatMoeda(result.custoPed||0),isPedagio:true},
                (result.custoVeiculo||0)>0&&{emoji:"🚗",l:"Desgaste do veículo",v:formatMoeda(result.custoVeiculo||0),isDesgaste:true},
              ].filter(Boolean).map((r,i,arr)=>{
                const avisoDesgaste=r.isDesgaste?formatAvisoCamposAusentes(resolveCamposAusentesSalvo(readCustoVeiculoLocalCache())):"";
                return(
                <div key={i}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"11px 0",borderBottom:i<arr.length-1&&!r.isPedagio&&!avisoDesgaste?`1px solid ${C.border}`:r.isPedagio||avisoDesgaste?"none":`1px solid ${C.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:9}}>
                      <span style={{fontSize:18}}>{r.emoji}</span>
                      <div><div style={{color:C.text2,fontSize:14}}>{r.l}</div>{r.sub&&<div style={{color:C.muted,fontSize:12,marginTop:1}}>{r.sub}</div>}</div>
                    </div>
                    <span style={{color:C.navy,fontWeight:700,fontSize:15}}>{r.v}</span>
                  </div>
                  {r.isPedagio&&(result.custoPed||0)>0&&<div style={{color:C.muted,fontSize:11,paddingBottom:11,borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>{PEDAGIO_AVISO_RESULTADO}</div>}
                  {avisoDesgaste&&<div style={{color:C.muted,fontSize:11,paddingBottom:11,borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>{avisoDesgaste}</div>}
                </div>
              );})}
              {!(result.custoVeiculo>0)&&(
                <button type="button" onClick={()=>onGoMeuVeiculo?.()} style={{background:"none",border:"none",padding:"10px 0 2px",cursor:"pointer",color:C.navy,fontSize:12,fontWeight:600,textDecoration:"underline",textAlign:"left"}}>
                  Calcular o custo do meu veículo
                </button>
              )}
            </div>
            {stops.some(s=>s.v)&&(
              <div style={{background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:11,padding:"12px 14px"}}>
                <div style={{color:"#1D4ED8",fontSize:14,fontWeight:700,marginBottom:10,textAlign:"center"}}>📍 Rota Completa</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {stops.filter(s=>s.v).map((s,i,arr)=>(
                    <div key={s.id} style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:10,height:10,borderRadius:"50%",background:i===0?"#22C55E":i===arr.length-1?C.red:C.orange,flexShrink:0}}/>
                      <span style={{color:"#1D4ED8",fontSize:14,fontWeight:i===0||i===arr.length-1?700:500}}>{s.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <BotaoNavegar stops={stops}/>
          </div>
        )}
      </div>
    </ModalWrap>
  );
};

const RouteCalcModal=({onClose,vehicles,valorKmPadrao,adicionalPadrao,onSalvarHistorico,onConcluido,perfil,uid,onGoMeuVeiculo})=>{
  const isPago=getPlanoAtual(perfil).isPago;
  const[limiteFrete,setLimiteFrete]=useState(false);
  const[stops,setStops]=useState([{id:1,v:"",coords:null},{id:2,v:"",coords:null}]);
  const[vehicleId,setVehicleId]=useState("carro");
  const[fuelPrice,setFuelPrice]=useState("");
  const[consumo,setConsumo]=useState("");
  const[arlaPrice,setArlaPrice]=useState("");
  const[arlaConsumption,setArlaConsumption]=useState("");
  const[pedagioTotal,setPedagioTotal]=useState("");
  const[pedagioAuto,setPedagioAuto]=useState(false);
  const pedagioEditadoPeloUsuarioRef=useRef(false);
  const[trailer,setTrailer]=useState("none");
  const[trailerAxleMap,setTrailerAxleMap]=useState({simples:1,duplo:2});
  const[editingTrailer,setEditingTrailer]=useState(null);
  const[editTrailerVal,setEditTrailerVal]=useState("");
  const[metaLocal,setMetaLocal]=useState(valorKmPadrao||"");
  const[freight,setFreight]=useState("");
  const[valorMinSaida,setValorMinSaida]=useState("");
  const[kmInclusosMin,setKmInclusosMin]=useState("");
  const[metaLucro,setMetaLucro]=useState("25");
  const[dists,setDists]=useState([""]);
  const[tempoEstimadoSeg,setTempoEstimadoSeg]=useState(null);
  const[result,setResult]=useState(null);
  const[salvou,setSalvou]=useState(false);
  const[cargo,setCargo]=useState("");
  const[observacao,setObservacao]=useState("");
  const[nomeCliente,setNomeCliente]=useState("");
  const[erro,setErro]=useState("");
  const[buscandoDist,setBuscandoDist]=useState(false);
  const[showStatusModal,setShowStatusModal]=useState(false);
  const[pendingSave,setPendingSave]=useState(null);
  const nid=useRef(3);
  const[offlineHydrated,setOfflineHydrated]=useState(false);
  const[offlineRestored,setOfflineRestored]=useState(false);
  const skipVehicleReset=useRef(true);

  useEffect(()=>{ warmGeocodeProximity(); }, []);

  useEffect(()=>{
    if(!uid||isPago)return;
    (async()=>{
      setLimiteFrete(!(await podeUsar(uid,"frete",FREE_LIMITS.frete)));
    })();
  },[uid,isPago]);

  useEffect(()=>{
    const cached=readOfflineCache(OFFLINE_KEYS.frete);
    const temDados=cached&&(
      String(cached.fuelPrice||"").trim()||
      String(cached.arlaPrice||"").trim()||
      String(cached.consumo||"").trim()||
      String(cached.cargo||"").trim()||
      String(cached.metaLocal||"").trim()||
      String(cached.freight||"").trim()||
      String(cached.valorMinSaida||"").trim()||
      String(cached.kmInclusosMin||"").trim()||
      String(cached.metaLucro||"").trim()||
      cached.vehicleId
    );
    if(temDados){
      if(cached.vehicleId)setVehicleId(cached.vehicleId);
      if(cached.fuelPrice!=null)setFuelPrice(String(cached.fuelPrice));
      if(cached.arlaPrice!=null&&String(cached.arlaPrice).trim()!=="")setArlaPrice(String(cached.arlaPrice));
      if(cached.consumo!=null)setConsumo(String(cached.consumo));
      if(cached.trailer)setTrailer(cached.trailer);
      if(cached.trailerAxleMap)setTrailerAxleMap(cached.trailerAxleMap);
      if(cached.cargo!=null)setCargo(String(cached.cargo));
      if(cached.metaLocal!=null)setMetaLocal(String(cached.metaLocal));
      if(cached.freight!=null)setFreight(String(cached.freight));
      if(cached.valorMinSaida!=null)setValorMinSaida(String(cached.valorMinSaida));
      if(cached.kmInclusosMin!=null)setKmInclusosMin(String(cached.kmInclusosMin));
      if(cached.metaLucro!=null)setMetaLucro(String(cached.metaLucro));
      setOfflineRestored(true);
      setTimeout(()=>setOfflineRestored(false),3500);
    }
    setOfflineHydrated(true);
  },[]);

  useEffect(()=>{
    if(!offlineHydrated)return;
    const temDados=
      String(fuelPrice||"").trim()||
      String(arlaPrice||"").trim()||
      String(consumo||"").trim()||
      String(cargo||"").trim()||
      String(metaLocal||"").trim()||
      String(freight||"").trim()||
      String(valorMinSaida||"").trim()||
      String(kmInclusosMin||"").trim()||
      String(metaLucro||"").trim()||
      vehicleId!=="carro"||trailer!=="none";
    if(!temDados)return;
    writeOfflineCache(OFFLINE_KEYS.frete,{
      vehicleId,fuelPrice,arlaPrice,consumo,trailer,trailerAxleMap,cargo,
      metaLocal,freight,valorMinSaida,kmInclusosMin,metaLucro,
    });
  },[offlineHydrated,vehicleId,fuelPrice,arlaPrice,consumo,trailer,trailerAxleMap,cargo,metaLocal,freight,valorMinSaida,kmInclusosMin,metaLucro]);

  const aplicarPedagioAuto=async(stopsAtuais)=>{
    if(pedagioEditadoPeloUsuarioRef.current)return null;
    try{
      const out=await buscarPedagioRoutes(stopsAtuais,{travelMode:travelModePedagio(vehicleId)});
      if(out.ok){
        if(out.valorPedagio>0){
          setPedagioTotal(out.formatado);
          setPedagioAuto(true);
          return out.formatado;
        }
        setPedagioTotal("");
        setPedagioAuto(false);
        return "";
      }
      setPedagioAuto(false);
    }catch(err){
      console.error("[LogRotas] Falha ao estimar pedágio (Frete):",err);
      setPedagioAuto(false);
    }
    return null;
  };

  // V276 — distância + pedágio automáticos com debounce (origem e destino obrigatórios)
  const buscarDistEPedagioAuto=async(stopsAtuais)=>{
    const origem=String(stopsAtuais[0]?.v||"").trim();
    const destino=String(stopsAtuais[stopsAtuais.length-1]?.v||"").trim();
    if(!origem||!destino)return;
    if(!pedagioEditadoPeloUsuarioRef.current){
      setPedagioTotal("");
      setPedagioAuto(false);
    }
    setBuscandoDist(true);
    try{
      const resolvidos=await resolveCalculatorStopsCoords(stopsAtuais);
      const coordsList=resolvidos.map(s=>s.coords);
      const out=await fetchRouteTotalDistanceKm(coordsList);
      if(!out.ok){setTempoEstimadoSeg(null);return;}
      setTempoEstimadoSeg(out.durationSeconds??null);
      const segments=(out.segmentKm||[]).map(km=>(km!=null?String(km):""));
      while(segments.length<stopsAtuais.length-1)segments.push("");
      setDists(segments.slice(0,stopsAtuais.length-1));
      setStops(prev=>prev.map((s,i)=>{
        const next=resolvidos[i]?.coords??s.coords;
        const cur=s.coords;
        if(cur&&next&&cur[0]===next[0]&&cur[1]===next[1])return s;
        if(!cur&&!next)return s;
        return{...s,coords:next};
      }));
      await aplicarPedagioAuto(resolvidos);
    }finally{
      setBuscandoDist(false);
    }
  };

  const stopsEnderecoKey=stops.map(s=>`${s.id}:${String(s.v||"").trim()}`).join("|");
  useEffect(()=>{
    if(!offlineHydrated)return;
    const origem=String(stops[0]?.v||"").trim();
    const destino=String(stops[stops.length-1]?.v||"").trim();
    if(!origem||!destino)return;
    const t=setTimeout(()=>buscarDistEPedagioAuto(stops),800);
    return()=>clearTimeout(t);
  },[stopsEnderecoKey,offlineHydrated,vehicleId,trailer]);

  const veh=vehicles.find(v=>v.id===vehicleId)||vehicles[0];
  const isElec=veh.electric;
  const isTruck=vehicleId==="caminhao";
  const showTrailer=vehicleId==="carro"||vehicleId==="eletrico";
  const trailerExtra=showTrailer?(trailerAxleMap[trailer]||0):0;
  useEffect(()=>{
    if(skipVehicleReset.current){
      skipVehicleReset.current=false;
      return;
    }
    const cached=readOfflineCache(OFFLINE_KEYS.frete);
    if(isElec)setFuelPrice(String(veh.kwh||1.85));
    else if(cached?.fuelPrice!=null)setFuelPrice(String(cached.fuelPrice));
    else setFuelPrice("");
    setTrailer("none");
    if(cached?.arlaPrice!=null&&String(cached.arlaPrice).trim()!=="")setArlaPrice(String(cached.arlaPrice));
    else setArlaPrice("");
    setArlaConsumption("");
    setResult(null);
  },[vehicleId]);

  const addStop=()=>{if(stops.length>=8)return;setStops(s=>[...s,{id:nid.current++,v:"",coords:null}]);setDists(d=>[...d,""]);}
  const[showWpp,setShowWpp]=useState(false);
  const paradaSearchBias=()=>buildCalculatorStopSearchBias(stops[0]?.v,stops[0]?.coords);

  const kmTotalSoma=dists.reduce((s,d)=>s+(parseNumeroBR(d)||0),0);
  const kmTotalExibicao=dists.some(d=>d&&String(d).trim()!=="")
    ?(Number.isInteger(kmTotalSoma)?String(kmTotalSoma):kmTotalSoma.toFixed(1))
    :"";

  const calcular=async()=>{
    setErro("");
    if(!isPago&&uid){
      const ok=await podeUsar(uid,"frete",FREE_LIMITS.frete);
      if(!ok){setLimiteFrete(true);return;}
    }
    const pedagioAutoVal=await aplicarPedagioAuto(stops);
    const pedagioCalc=pedagioAutoVal??pedagioTotal;
    const out=calculateRouteCosts({
      segmentDistances:dists,
      hasOrigin:!!stops[0]?.v,
      hasDestination:!!stops[stops.length-1]?.v,
      isElec,
      isTruck,
      fuelPrice,
      consumo,
      defaultKwhPer100:veh.kwh||0.20,
      defaultConsumptionKmL:veh.consumption||1,
      arlaConsumption,
      arlaPrice,
      tollTotalReais:pedagioCalc,
      vehicleId,
      vehicleLabel:veh.label,
      vehicleAxles:veh.axles,
      trailerExtra,
      freight,
      metaLocal,
      custoKmVeiculo:resolveCustoKmSalvo(readCustoVeiculoLocalCache()),
      tempoEstimadoSeg,
    });
    if(!out.ok){setErro(out.error);return;}
    setErro("");
    if(!isPago&&uid)void incrementarUso(uid,"frete");
    setResult(out.result);
    onConcluido?.("frete");
    if(!isPago&&uid){
      setLimiteFrete(!(await podeUsar(uid,"frete",FREE_LIMITS.frete)));
    }
  };

  const TRAILER_OPTS=[
    {id:"none",   label:"Sem reboque",    emoji:"🚫",desc:"Sem eixos adicionais"},
    {id:"simples",label:"Reboque simples",emoji:"🔗",desc:`+${plural(trailerAxleMap.simples,"eixo","eixos")}`},
    {id:"duplo",  label:"Reboque duplo",  emoji:"⛓️",desc:`+${plural(trailerAxleMap.duplo,"eixo","eixos")}`},
  ];

  return(
    <ModalWrap maxW={520}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div>
          <div style={{color:C.text,fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif"}}>Calculadora de Frete</div>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>Calcule custo, combustível e lucro da viagem</div>
        </div>
        <button onClick={onClose} style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:10,padding:8,cursor:"pointer",color:C.muted,display:"flex"}}><XIcon size={15}/></button>
      </div>
      <OfflineRestoredBanner show={offlineRestored}/>
      {limiteFrete&&!isPago&&(
        <LimiteAtingido mensagem={MSG_LIMITE.frete} style={{marginBottom:14}}/>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:14,overflowX:"hidden",maxWidth:"100%",minWidth:0}}>

        {/* ── BLOCO 1: ROTA ── */}
        <div style={{background:C.subtle,borderRadius:16,padding:"16px",overflow:"visible",maxWidth:"100%"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
            <div style={{width:28,height:28,borderRadius:8,background:C.navy,display:"flex",alignItems:"center",justifyContent:"center"}}><RouteIcon size={13} color="#fff"/></div>
            <span style={{color:C.navy,fontWeight:800,fontSize:14,fontFamily:"'Sora',sans-serif"}}>Rota</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:CALC_ROTA_GAP,overflow:"visible",maxWidth:"100%",minWidth:0}}>
            {/* Origem */}
            <AddressInput
              value={stops[0]?.v||""}
              onChange={v=>setStops(s=>s.map((x,i)=>i===0?{...x,v,coords:null}:x))}
              onSelect={s=>{
                pedagioEditadoPeloUsuarioRef.current=false;
                setPedagioAuto(false);
                setStops(prev=>prev.map((x,i)=>i===0?{...x,v:s.label,coords:s.coords}:x));
              }}
              placeholder="Origem (ex: São Paulo, SP)"
              dotColor={C.green}
              calc
              enableVoice
              enableMyLocation
            />

            {/* Paradas intermediárias */}
            {stops.slice(1,-1).map((stop,i)=>(
              <div key={stop.id} style={{display:"flex",alignItems:"center",gap:8,minWidth:0,maxWidth:"100%"}}>
                <AddressInput
                  value={stop.v}
                  onChange={v=>setStops(s=>s.map(x=>x.id===stop.id?{...x,v,coords:null}:x))}
                  onSelect={s=>{
                    pedagioEditadoPeloUsuarioRef.current=false;
                    setPedagioAuto(false);
                    setStops(prev=>prev.map(x=>x.id===stop.id?{...x,v:s.label,coords:s.coords}:x));
                  }}
                  placeholder={`Parada ${i+1}`}
                  dotColor={C.orange}
                  calc
                  enableVoice
                  enableMyLocation
                  searchOptions={paradaSearchBias}
                />
                <button onClick={()=>{setStops(s=>s.filter(x=>x.id!==stop.id));setDists(d=>d.filter((_,j)=>j!==i));}}
                  style={{background:C.redLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.red,display:"flex",flexShrink:0}}><Trash2Icon size={12}/></button>
              </div>
            ))}

            {/* Botão adicionar parada — entre origem e destino */}
            {stops.length<8&&(
              <button onClick={()=>{setStops(s=>[...s.slice(0,-1),{id:nid.current++,v:"",coords:null},s[s.length-1]]);setDists(d=>[...d,""])}}
                style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:"transparent",border:`1.5px dashed ${C.orange}77`,borderRadius:9,padding:"7px 12px",cursor:"pointer",color:C.orange,fontWeight:600,fontSize:12,width:"100%"}}>
                <PlusCircleIcon size={12}/> + Adicionar parada intermediária
              </button>
            )}

            {/* Destino */}
            <AddressInput
              value={stops[stops.length-1]?.v||""}
              onChange={v=>setStops(s=>s.map((x,i)=>i===s.length-1?{...x,v,coords:null}:x))}
              onSelect={s=>{
                pedagioEditadoPeloUsuarioRef.current=false;
                setPedagioAuto(false);
                setStops(prev=>prev.map((x,i)=>i===prev.length-1?{...x,v:s.label,coords:s.coords}:x));
              }}
              placeholder="Destino final"
              dotColor={C.red}
              calc
              enableVoice
              enableMyLocation
              searchOptions={paradaSearchBias}
            />

            {stops.length>2&&Array.from({length:stops.length-1}).map((_,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,minWidth:0,maxWidth:"100%"}}>
                <div style={{color:C.muted,fontSize:12,flexShrink:0,minWidth:56}}>{`Trecho ${i+1}`}:</div>
                <div style={{display:"flex",alignItems:"stretch",background:"#fff",border:`1.5px solid ${buscandoDist?C.orange:C.calcBorder}`,borderRadius:10,overflow:"hidden",flex:1,minWidth:0,minHeight:CALC_INPUT_ROW_H,transition:"border-color .3s"}}>
                  <input value={dists[i]||""} onChange={e=>setDists(d=>{const n=[...d];n[i]=e.target.value;return n;})}
                    placeholder={buscandoDist?"Calculando...":""} type="number" inputMode="decimal"
                    style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,...calcFieldInputStyle,fontWeight:700}}/>
                  <span style={{padding:"0 10px",color:buscandoDist?C.orange:C.muted,fontSize:12,borderLeft:`1px solid ${C.border}`,background:C.subtle,alignSelf:"stretch",display:"flex",alignItems:"center"}}>
                    {buscandoDist?"🔍":"km"}
                  </span>
                </div>
              </div>
            ))}
            {stops.length>1&&(
              <div style={{display:"flex",alignItems:"stretch",background:"#fff",border:`1.5px solid ${buscandoDist?"#3B82F6":C.calcBorder}`,borderRadius:10,overflow:"hidden",minHeight:CALC_INPUT_ROW_H}}>
                <input value={kmTotalExibicao} readOnly tabIndex={-1} placeholder={buscandoDist?"Calculando…":"KM total"}
                  style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,...calcFieldInputStyle,fontWeight:700,cursor:"default"}}/>
                <span style={{padding:"0 10px",color:buscandoDist?"#3B82F6":C.muted,fontSize:12,borderLeft:`1px solid ${C.border}`,background:C.subtle,alignSelf:"stretch",display:"flex",alignItems:"center"}}>{buscandoDist?"🔍":"km"}</span>
              </div>
            )}
            {buscandoDist&&(
              <div style={{background:C.orangeLight,border:`1px solid ${C.orange}33`,borderRadius:9,padding:"8px 12px",display:"flex",alignItems:"center",gap:7}}>
                <span style={{fontSize:14}}>🛣️</span>
                <span style={{color:C.orange,fontSize:12,fontWeight:600}}>Calculando a distância real da rota...</span>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              <Field label="🏁 Pedágio (R$)" value={pedagioTotal} onChange={v=>{setPedagioTotal(v);setPedagioAuto(false);pedagioEditadoPeloUsuarioRef.current=String(v||"").trim()!=="";}} prefix="R$" calc/>
              {pedagioAuto&&parseNumeroBR(pedagioTotal)>0&&<div style={{color:C.muted,fontSize:11,marginTop:2,textAlign:"center",lineHeight:1.4,paddingBottom:2}}>Estimativa automática — confira o valor da praça.</div>}
            </div>
          </div>
        </div>

        {/* ── BLOCO 2: VEÍCULO ── */}
        <div style={{background:C.subtle,borderRadius:16,padding:"16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
            <div style={{width:28,height:28,borderRadius:8,background:C.orange,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:14}}>🚛</span></div>
            <span style={{color:C.navy,fontWeight:800,fontSize:14,fontFamily:"'Sora',sans-serif"}}>Veículo</span>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:12}}>
            {vehicles.map(v=>{
              const sel=vehicleId===v.id;
              const cor=v.electric?C.electric:C.orange;
              return(
                <button key={v.id} onClick={()=>setVehicleId(v.id)}
                  style={{background:sel?"#fff":C.surface,border:`2px solid ${sel?cor:C.border}`,borderRadius:13,padding:"12px 10px",cursor:"pointer",textAlign:"center",boxShadow:sel?`0 2px 12px ${cor}22`:"none",transition:"all .15s"}}>
                  <div style={{fontSize:26,marginBottom:4}}>{v.emoji}</div>
                  <div style={{color:sel?cor:C.text,fontWeight:700,fontSize:12}}>{v.label}</div>
                  <div style={{color:C.muted,fontSize:10,marginTop:2}}>{v.id==="caminhao"?`${plural(v.axles,"eixo","eixos")} · `:null}{v.electric?formatKwhPrice(v.kwh):formatConsumoKmL(v.consumption)}</div>
                  {sel&&<div style={{marginTop:6,display:"inline-block",background:cor,borderRadius:20,padding:"2px 8px"}}><span style={{color:"#fff",fontSize:9,fontWeight:800}}>✓ Selecionado</span></div>}
                </button>
              );
            })}
          </div>

          {/* Trailer — V235: seletor compartilhado com a Calculadora de Viagem */}
          {showTrailer&&(
            <TrailerSelector options={TRAILER_OPTS} value={trailer} onChange={setTrailer}/>
          )}
        </div>

        {/* ── BLOCO 3: CUSTOS ── */}
        <div style={{background:C.subtle,borderRadius:16,padding:"16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
            <div style={{width:28,height:28,borderRadius:8,background:C.red,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:14}}>⛽</span></div>
            <span style={{color:C.navy,fontWeight:800,fontSize:14,fontFamily:"'Sora',sans-serif"}}>Custos da Viagem</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {isElec
              ?<Field label="⚡ Energia (R$/kWh)" value={fuelPrice} onChange={setFuelPrice} prefix="R$" calc/>
              :<Field label="⛽ Combustível (R$/L)" value={fuelPrice} onChange={setFuelPrice} prefix="R$" calc/>}
            <Field label={isElec?"⚡ Consumo (kWh/100km)":"⛽ Consumo (km/L)"} value={consumo} onChange={setConsumo} suffix={isElec?"kWh/100km":"km/L"} calc/>
            {isTruck&&<>
              <Field label="🟦 ARLA 32 (R$/L) — coloque 0 se não usar" value={arlaPrice} onChange={setArlaPrice} prefix="R$" calc/>
              <Field label="🟦 Consumo ARLA 32 (L/100km)" value={arlaConsumption} onChange={setArlaConsumption} suffix="L/100km" hint="Padrão: 3.5 L por 100km" calc/>
            </>}
            <Field label="📦 Tipo de Carga (opcional)" value={cargo} onChange={setCargo} placeholder="ex: Eletrônicos, Alimentos" calc/>
          </div>
        </div>

        {/* ── BLOCO 4: MEU FRETE ── */}
        <div style={{background:C.navyLight,border:`2px solid ${C.navy}22`,borderRadius:16,padding:"16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:12}}>
            <div style={{width:28,height:28,borderRadius:8,background:C.green,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:14}}>💰</span></div>
            <span style={{color:C.navy,fontWeight:800,fontSize:14,fontFamily:"'Sora',sans-serif"}}>Meu Frete</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <Field label="Meu valor por km (R$)" value={metaLocal} onChange={v=>setMetaLocal(v)} prefix="R$" suffix="/km" calc/>
            <Field label="Adicional fixo — opcional (R$)" value={freight} onChange={setFreight} prefix="R$" hint="Taxa extra por carga especial, espera, etc." calc/>
            <Field label="Valor mínimo de saída (R$)" value={valorMinSaida} onChange={setValorMinSaida} prefix="R$" hint="Opcional — frete mínimo para viagens curtas." calc/>
            <Field label="KM inclusos no mínimo" value={kmInclusosMin} onChange={setKmInclusosMin} suffix="km" hint="Opcional — km cobertos pelo valor mínimo de saída." calc/>
            <Field label="Meta de lucro mínima (%)" value={metaLucro} onChange={setMetaLucro} suffix="%" hint="Veja se o frete bate sua meta de lucro." calc/>
          </div>
        </div>

        {/* Erro de validação */}
        {erro&&(
          <div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:11,padding:"11px 14px",display:"flex",alignItems:"center",gap:8}}>
            <span style={{color:"#DC2626",fontSize:14,fontWeight:600}}>{erro}</span>
          </div>
        )}

        {/* Botão calcular */}
        <button onClick={calcular} disabled={limiteFrete&&!isPago}
          style={{width:"100%",padding:"15px",background:isElec?C.electric:C.orange,border:"none",borderRadius:14,cursor:limiteFrete&&!isPago?"not-allowed":"pointer",color:"#fff",fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:9,boxShadow:`0 4px 20px ${isElec?C.electric:C.orange}55`,letterSpacing:0.3,opacity:limiteFrete&&!isPago?0.55:1}}>
          <RouteIcon size={17}/> Calcular Rota Agora
        </button>

        {/* ── RESULTADO ── */}
        {result&&(()=>{
          const quote=calculateFreteQuote(result,{valorPorKm:metaLocal,adicionalFixo:freight,valorMinimoSaida:valorMinSaida,kmInclusosMinimo:kmInclusosMin});
          const {freteSug,lucroFinal,ok,usedMinimum,kmExcedente}=quote;
          const profitMeta=calculateProfitMeta({lucroFinal,freteSug,metaLucroPercent:metaLucro});
          return(
            <div style={{display:"flex",flexDirection:"column",gap:10,overflowX:"hidden",maxWidth:"100%",minWidth:0}}>
              {/* Veredicto — suave */}
              <div style={{background:ok?"#F0FDF4":"#FFF5F5",border:`1.5px solid ${ok?"#86EFAC":"#FCA5A5"}`,borderRadius:14,padding:"14px 16px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:26}}>{ok?"✅":"❌"}</div>
                <div>
                  <div style={{color:ok?"#15803D":"#DC2626",fontWeight:700,fontSize:15,fontFamily:"'Sora',sans-serif"}}>{ok?"Frete cobre os custos!":"Custos acima do frete"}</div>
                  <div style={{color:C.muted,fontSize:12,marginTop:2}}>{result.tot} km{result.isElec?" · ⚡ Elétrico":""}</div>
                  <div style={{color:ok?"#15803D":"#64748B",fontSize:13,fontWeight:600,marginTop:4}}>
                    Tempo estimado: {formatDurationApprox(result.tempoEstimadoSeg)||"—"}
                  </div>
                </div>
              </div>

              {/* Linhas de custo — suave */}
              <div style={{background:"#F8FAFC",borderRadius:14,padding:"14px 16px",display:"flex",flexDirection:"column",gap:0}}>
                {[
                  {emoji:result.isElec?"⚡":"⛽",l:result.isElec?"Custo Energia":"Custo Combustível",v:formatMoeda(result.energyCost||0),c:"#1E40AF"},
                  result.isTruck&&result.arlaCost>0&&{emoji:"🟦",l:"ARLA 32",v:formatMoeda(result.arlaCost||0),c:"#6D28D9"},
                  {emoji:"🏁",l:"Pedágio",v:formatMoeda(result.tollCost||0),c:"#B45309",isPedagio:true},
                  (result.custoVeiculo||0)>0&&{emoji:"🚗",l:"Desgaste do veículo",v:formatMoeda(result.custoVeiculo||0),c:"#1E3A8A",isDesgaste:true},
                  {emoji:"📊",l:"Custo Total da Viagem",v:formatMoeda(result.total||0),c:"#DC2626",bold:true},
                ].filter(Boolean).map((r,i,arr)=>{
                  const avisoDesgaste=r.isDesgaste?formatAvisoCamposAusentes(resolveCamposAusentesSalvo(readCustoVeiculoLocalCache())):"";
                  return(
                  <div key={i}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:r.sub?"flex-start":"center",padding:"10px 0",borderBottom:r.isPedagio||avisoDesgaste?"none":i<arr.length-1?`1px solid ${C.border}`:"none"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:14}}>{r.emoji}</span>
                        <div>
                          <span style={{color:C.text2,fontSize:14}}>{r.l}</span>
                          {r.sub&&<div style={{color:C.muted,fontSize:12,marginTop:2}}>{r.sub}</div>}
                        </div>
                      </div>
                      <span style={{color:r.c,fontWeight:r.bold?700:400,fontSize:14}}>{r.v}</span>
                    </div>
                    {r.isPedagio&&(result.tollCost||0)>0&&<div style={{color:C.muted,fontSize:11,paddingBottom:10,borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>{PEDAGIO_AVISO_RESULTADO}</div>}
                    {avisoDesgaste&&<div style={{color:C.muted,fontSize:11,paddingBottom:10,borderBottom:i<arr.length-1?`1px solid ${C.border}`:"none"}}>{avisoDesgaste}</div>}
                  </div>
                );})}
                {!(result.custoVeiculo>0)&&(
                  <button type="button" onClick={()=>onGoMeuVeiculo?.()} style={{background:"none",border:"none",padding:"8px 0 2px",cursor:"pointer",color:C.navy,fontSize:12,fontWeight:600,textDecoration:"underline",textAlign:"left"}}>
                    Calcular o custo do meu veículo
                  </button>
                )}
              </div>

              {/* Valor do frete em destaque — o que cobrar do cliente */}
              {freteSug>0&&(
                <div style={{background:`linear-gradient(135deg,${C.navy}08,${C.navy}04)`,border:`2px solid ${C.navy}22`,borderRadius:14,padding:"18px 16px",display:"flex",flexDirection:"column",alignItems:"center",gap:6,textAlign:"center",maxWidth:"100%",overflowX:"hidden",boxSizing:"border-box"}}>
                  <span style={{color:C.navy,fontSize:14,fontWeight:700,letterSpacing:1,textTransform:"uppercase"}}>💰 VALOR A COBRAR DO CLIENTE</span>
                  <span style={{color:C.navy,fontWeight:900,fontSize:40,fontFamily:"'Sora',sans-serif",lineHeight:1,maxWidth:"100%",wordBreak:"break-word"}}>
                    {formatMoeda(freteSug)}
                  </span>
                  <span style={{color:C.muted,fontSize:12,wordBreak:"break-word",lineHeight:1.4}}>
                    {usedMinimum
                      ?(result.tot<=(parseNumeroBR(kmInclusosMin)||0)
                        ?`Mínimo ${formatMoeda(parseNumeroBR(valorMinSaida)||0)} (${parseNumeroBR(kmInclusosMin)||0} km inclusos)`
                        :`${formatMoeda(parseNumeroBR(valorMinSaida)||0)} + ${kmExcedente} km × ${formatMoedaKm(parseNumeroBR(metaLocal)||0)}`)
                      :`${result.tot} km × ${formatMoedaKm(parseNumeroBR(metaLocal)||0)}`}
                    {parseNumeroBR(freight)>0?` + ${formatMoeda(parseNumeroBR(freight)||0)} adicional`:""}
                  </span>
                  {/* Lucro — informação secundária */}
                  <div style={{marginTop:6,width:"100%",background:ok?"#F0FDF4":"#FFF5F5",border:`1px solid ${ok?"#BBF7D0":"#FCA5A5"}`,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:ok?"#15803D":"#DC2626",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5}}>
                      <span>{ok?"💵":"⚠️"}</span> Meu lucro estimado
                    </span>
                    <span style={{color:ok?"#15803D":"#DC2626",fontWeight:700,fontSize:15,fontFamily:"'Sora',sans-serif"}}>
                      {formatMoeda(lucroFinal||0)}
                    </span>
                  </div>
                  {/* Barra de meta de lucro */}
                  {profitMeta&&(
                      <div style={{marginTop:6,width:"100%",background:profitMeta.bg,border:`1px solid ${profitMeta.borda}`,borderRadius:10,padding:"12px 14px"}}>
                        <div style={{display:"flex",justifyContent:"flex-start",alignItems:"center",marginBottom:8}}>
                          <span style={{color:profitMeta.cor,fontSize:14,fontWeight:700}}>{profitMeta.emoji} {profitMeta.msg}</span>
                        </div>
                        <div style={{background:"#E5E7EB",borderRadius:99,height:8,overflow:"hidden"}}>
                          <div style={{width:`${profitMeta.pct}%`,height:"100%",background:profitMeta.barCor,borderRadius:99,transition:"width 0.4s ease"}}/>
                        </div>
                      </div>
                  )}
                </div>
              )}

              {/* Campo nome do cliente */}
              {freteSug>0&&(
                <div style={{background:"#F8FAFC",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px"}}>
                  <div style={{color:C.text2,fontSize:14,fontWeight:700,marginBottom:6}}>👤 Nome do cliente (opcional)</div>
                  <input value={nomeCliente} onChange={e=>setNomeCliente(e.target.value)}
                    placeholder="Ex: Sr. Renato, João da Transportadora XYZ..."
                    style={{width:"100%",background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,lineHeight:1.5,resize:"none",boxSizing:"border-box"}}/>
                </div>
              )}

              {/* Campo de observação */}
              {freteSug>0&&(
                <div style={{background:"#F8FAFC",border:`1.5px solid ${C.border}`,borderRadius:12,padding:"12px 14px"}}>
                  <div style={{color:C.text2,fontSize:14,fontWeight:700,marginBottom:6}}>📝 Observação (opcional)</div>
                  <input value={observacao} onChange={e=>setObservacao(e.target.value)}
                    placeholder="Ex: telefone, instruções da carga, horário preferencial..."
                    style={{width:"100%",background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,lineHeight:1.5,resize:"none",boxSizing:"border-box"}}/>
                </div>
              )}

              {/* Botão WhatsApp */}
              {freteSug>0&&(
                <button onClick={()=>setShowWpp(true)}
                  style={{width:"100%",padding:"13px",background:"#22C55E",border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:600,fontSize:14,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:9}}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.537 4.049 1.475 5.757L.057 23.928c-.046.228.13.445.362.445a.42.42 0 00.102-.013l6.345-1.646A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.712 9.712 0 01-4.943-1.349l-.354-.209-3.664.95.982-3.561-.231-.371A9.712 9.712 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                  Enviar Orçamento pelo WhatsApp
                </button>
              )}

              {result&&<BotaoNavegar stops={stops}/>}

              {/* Modal WhatsApp — usa <a> para abrir direto sem popup */}
              {showWpp&&(()=>{
                const origem=stops[0]?.v||"Origem";
                const destino=stops[stops.length-1]?.v||"Destino";
                const paradasMid=stops.slice(1,-1).map(s=>s.v).filter(Boolean);
                const empresaTopo=(perfil?.empresa||"").trim();
                const clienteTopo=(nomeCliente||"").trim();
                const dEmissao=new Date();
                const dataAtualFormatada=`${String(dEmissao.getDate()).padStart(2,"0")}/${String(dEmissao.getMonth()+1).padStart(2,"0")}/${dEmissao.getFullYear()}`;
                let msg="";
                if(empresaTopo) msg+=`${empresaTopo}\n\n`;
                msg+="PROPOSTA DE PRESTAÇÃO DE SERVIÇO\n\n";
                if(clienteTopo) msg+=`Cliente: ${clienteTopo}\n`;
                msg+=`Data da emissão: ${dataAtualFormatada}\n`;
                msg+="Validade da proposta: 48 horas\n";
                msg+="━━━━━━━━━━━━━━━━━━━━━━\n";
                msg+="Origem\n";
                msg+=`📍 ${origem}\n`;
                if(paradasMid.length>0){
                  msg+=`${paradasMid.length===1?"Parada":"Paradas"}\n`;
                  msg+=`🔄 ${paradasMid.join(" → ")}\n`;
                }
                msg+="Destino\n";
                msg+=`🏁 ${destino}\n`;
                msg+="Distância estimada\n";
                msg+=`📏 ${result.tot} km\n`;
                msg+="━━━━━━━━━━━━━━━━━━━━━━\n";
                msg+="VALOR DO SERVIÇO\n";
                msg+=`${formatMoeda(freteSug)}\n`;
                msg+="━━━━━━━━━━━━━━━━━━━━━━\n";
                if(observacao){
                  msg+=`📝 Obs: ${observacao}\n`;
                  msg+="━━━━━━━━━━━━━━━━━━━━━━\n";
                }
                msg+="Agradecemos pela oportunidade de atendê-lo.\n";
                msg+="Esta proposta foi elaborada com base nas informações fornecidas e permanecerá válida pelo período informado acima.\n";
                msg+="Permanecemos à disposição e aguardamos sua confirmação para iniciarmos o atendimento.\n";
                msg+="━━━━━━━━━━━━━━━━━━━━━━\n";
                msg+="Orçamento gerado pelo app LogRotas";
                const wppUrl=`https://wa.me/?text=${encodeURIComponent(msg)}`;
                return(
                  <div style={{position:"fixed",inset:0,background:"#00000066",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
                    <div style={{background:C.surface,borderRadius:20,width:"100%",maxWidth:380,padding:24,boxShadow:"0 20px 60px #00000033",maxHeight:"85vh",display:"flex",flexDirection:"column"}}>
                      <div style={{color:C.navy,fontWeight:700,fontSize:15,fontFamily:"'Sora',sans-serif",marginBottom:14,flexShrink:0}}>📋 Prévia da mensagem</div>
                      <div style={{background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:12,padding:"14px 16px",marginBottom:18,flex:1,overflowY:"auto",minHeight:0}}>
                        <div style={{color:"#166534",fontSize:14,lineHeight:1.8,whiteSpace:"pre-line"}}>{msg.replace(/\*/g,"")}</div>
                      </div>
                      <div style={{display:"flex",gap:10,flexShrink:0}}>
                        <button onClick={()=>setShowWpp(false)} style={{flex:1,padding:"12px 0",background:C.subtle,border:`1px solid ${C.border}`,borderRadius:11,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:14}}>Cancelar</button>
                        <a href={wppUrl} target="_blank" rel="noreferrer" onClick={()=>setTimeout(()=>setShowWpp(false),200)}
                          style={{flex:2,padding:"12px 0",background:"#22C55E",borderRadius:11,color:"#fff",fontWeight:600,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:7,textDecoration:"none"}}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.537 4.049 1.475 5.757L.057 23.928c-.046.228.13.445.362.445a.42.42 0 00.102-.013l6.345-1.646A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.712 9.712 0 01-4.943-1.349l-.354-.209-3.664.95.982-3.561-.231-.371A9.712 9.712 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                          Enviar pelo WhatsApp
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Salvar no histórico — abre modal de status */}
              {freteSug>0&&(
                salvou?(
                  <div style={{background:"#F0FDF4",border:`1px solid #BBF7D0`,borderRadius:12,padding:"13px 16px",textAlign:"center"}}>
                    <div style={{color:"#15803D",fontWeight:700,fontSize:14}}>✓ Viagem salva no histórico!</div>
                    <div style={{color:"#15803D",fontSize:12,marginTop:4,opacity:0.8}}>Já aparece na aba Viagens e no Financeiro</div>
                  </div>
                ):(
                  <button onClick={()=>{
                    const paradasMid=stops.slice(1,-1).map(s=>s.v).filter(Boolean);
                    const quote=calculateFreteQuote(result,{valorPorKm:metaLocal,adicionalFixo:freight,valorMinimoSaida:valorMinSaida,kmInclusosMinimo:kmInclusosMin});
                    const minV=parseNumeroBR(valorMinSaida)||0;
                    const kmInc=parseNumeroBR(kmInclusosMin)||0;
                    setPendingSave(roundFreteCostsForSave({origin:stops[0]?.v||"Origem",dest:stops[stops.length-1]?.v||"Destino",paradas:paradasMid,date:new Date().toLocaleDateString("pt-BR"),hora:new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),distance:result.tot,veiculo:vehicles.find(v=>v.id===vehicleId)?.label||"",cargo,observacao,vkm:metaLocal,adicional:freight,energyCost:result.energyCost||0,tollCost:result.tollCost||0,arlaCost:result.arlaCost||0,custoVeiculo:result.custoVeiculo||0,custoTotal:result.total,freteSugerido:freteSug,lucro:lucroFinal,valorMinSaida:minV,kmInclusosMin:kmInc,kmExcedente:quote.kmExcedente||0,usedMinimum:!!quote.usedMinimum}));
                    setErro("");
                    setShowStatusModal(true);
                  }} style={{width:"100%",padding:"13px",background:C.navy,border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <SaveIcon size={15}/> Salvar no Histórico de Viagens
                  </button>
                )
              )}

              {/* Modal de status */}
              {showStatusModal&&pendingSave&&(
                <div style={{position:"fixed",inset:0,background:"#00000066",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
                  <div style={{background:C.surface,borderRadius:20,width:"100%",maxWidth:380,padding:24,boxShadow:"0 20px 60px #00000033"}}>
                    <div style={{color:C.navy,fontWeight:800,fontSize:18,fontFamily:"'Sora',sans-serif",marginBottom:6}}>💾 Salvar Frete</div>
                    <div style={{color:C.muted,fontSize:14,marginBottom:18}}>Este frete já foi realizado ou é um planejamento?</div>
                    {erro&&<div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",color:"#DC2626",fontSize:13,fontWeight:600,marginBottom:14}}>⚠️ {erro}</div>}
                    <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:18}}>
                      {[
                        {status:"concluido",emoji:"✅",label:"Já foi realizado",desc:"Entra no histórico e no financeiro como receita",color:C.green,bg:C.greenLight},
                        {status:"planejado",emoji:"📋",label:"É um planejamento",desc:"Não salvo por enquanto — só quando for realizado",color:C.navy,bg:C.navyLight},
                      ].map(opt=>(
                        <button key={opt.status} onClick={async()=>{
                          if(opt.status==="planejado"){
                            setSalvou(false);
                            setShowStatusModal(false);setPendingSave(null);
                            setErro("");
                            return;
                          }
                          if(opt.status==="concluido"&&onSalvarHistorico){
                            try{
                              setErro("");
                              await onSalvarHistorico({...pendingSave,status:opt.status});
                              setSalvou(true);
                              setShowStatusModal(false);setPendingSave(null);
                            }catch{
                              setErro("Não foi possível salvar. Verifique sua conexão e tente novamente.");
                            }
                          }
                        }} style={{background:opt.bg,border:`1.5px solid ${opt.color}33`,borderRadius:13,padding:"14px 16px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:12}}>
                          <span style={{fontSize:26}}>{opt.emoji}</span>
                          <div>
                            <div style={{color:opt.color,fontWeight:700,fontSize:14}}>{opt.label}</div>
                            <div style={{color:C.muted,fontSize:12,marginTop:2}}>{opt.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button onClick={()=>{setShowStatusModal(false);setErro("");}} style={{width:"100%",padding:"11px",background:C.subtle,border:`1px solid ${C.border}`,borderRadius:11,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:14}}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </ModalWrap>
  );
};

// ── FECHAMENTO DO DIA (v291) ──────────────────────────────────────────────────
const SERVICOS_BASE=["Uber","99","iFood"];
const FechamentoDia=({uid,perfil,setPerfil,vehicles=[],onSalvar,onClose,onGoMeuVeiculo})=>{
  const servicosCustom=Array.isArray(perfil?.servicosFechamento)?perfil.servicosFechamento:[];
  const servicos=[...SERVICOS_BASE,...servicosCustom.filter(s=>!SERVICOS_BASE.includes(s))];

  const[servico,setServico]=useState(servicos[0]||"Uber");
  const[showAddServ,setShowAddServ]=useState(false);
  const[novoServ,setNovoServ]=useState("");
  const[km,setKm]=useState("");
  const[valor,setValor]=useState("");
  const[combustivelInput,setCombustivelInput]=useState("");
  const[pedagio,setPedagio]=useState("");
  const[observacoes,setObservacoes]=useState("");
  const[salvando,setSalvando]=useState(false);
  const[erro,setErro]=useState("");
  const[veredito,setVeredito]=useState(null);

  // V292 — o motorista informa o VALOR TOTAL gasto de combustível (R$), não R$/L.
  const combustivel=roundMoney(parseNumeroBR(combustivelInput)||0);
  const pedagioNum=parseNumeroBR(pedagio)||0;
  const valorNum=parseNumeroBR(valor)||0;
  const kmNum=parseNumeroBR(km)||0;
  const custoKmSalvo=resolveCustoKmSalvo(readCustoVeiculoLocalCache());
  const custoVeiculo=roundMoney(custoKmSalvo>0&&kmNum>0?custoKmSalvo*kmNum:0);
  const custoTotal=roundMoney(combustivel+pedagioNum+custoVeiculo);
  const lucro=roundMoney(valorNum-custoTotal);
  const custoPorKmDia=kmNum>0?roundMoney(custoTotal/kmNum):0;

  const adicionarServico=async()=>{
    const nome=novoServ.trim();
    if(!nome)return;
    const existente=servicos.find(s=>s.toLowerCase()===nome.toLowerCase());
    if(existente){setServico(existente);setNovoServ("");setShowAddServ(false);return;}
    const novoPerfil={...perfil,servicosFechamento:[...servicosCustom,nome]};
    setPerfil(novoPerfil);
    setServico(nome);
    setNovoServ("");
    setShowAddServ(false);
    if(uid){try{await saveUserProfile(uid,perfilToFirestorePayload(novoPerfil));}catch{/* offline: fica só no estado */}}
  };

  const removerServico=async(nome)=>{
    const novaLista=servicosCustom.filter(s=>s.toLowerCase()!==nome.toLowerCase());
    const novoPerfil={...perfil,servicosFechamento:novaLista};
    setPerfil(novoPerfil);
    if(servico.toLowerCase()===nome.toLowerCase()){
      const restantes=[...SERVICOS_BASE,...novaLista.filter(s=>!SERVICOS_BASE.includes(s))];
      setServico(restantes[0]||"Uber");
    }
    if(uid){try{await saveUserProfile(uid,perfilToFirestorePayload(novoPerfil));}catch{/* offline: fica só no estado */}}
  };

  const isServicoCustom=(nome)=>servicosCustom.some(s=>s.toLowerCase()===nome.toLowerCase());

  const salvar=async()=>{
    setErro("");
    if(kmNum<=0){setErro("Informe o km rodado hoje.");return;}
    if(valorNum<=0){setErro("Informe o valor recebido.");return;}
    setSalvando(true);
    try{
      const agora=formatNowBR();
      const dados={
        data:agora.data,
        hora:agora.horario,
        servico,
        km:kmNum,
        valorRecebido:valorNum,
        combustivelCalculado:combustivel,
        pedagioOutros:pedagioNum,
        custoVeiculo,
        custoTotal,
        lucro,
        observacoes:observacoes.trim(),
      };
      await onSalvar?.(dados);
      setVeredito(dados);
    }catch{
      setErro("Não foi possível salvar. Tente novamente.");
    }finally{setSalvando(false);}
  };

  if(veredito){
    const custoKmV=veredito.km>0?roundMoney(veredito.custoTotal/veredito.km):0;
    const positivo=veredito.lucro>=0;
    return(
      <ModalWrap maxW={460}>
        <ModalHeader title="🌙 Dia fechado!" sub={`${veredito.servico} · ${veredito.data}`} onClose={onClose}/>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:positivo?"linear-gradient(135deg,#065F46,#059669)":"linear-gradient(135deg,#9F1239,#E11D48)",borderRadius:18,padding:"22px 20px",textAlign:"center",boxShadow:`0 8px 24px ${positivo?"#05966933":"#E11D4833"}`}}>
            <div style={{color:"#ECFDF5",fontSize:12,fontWeight:700,letterSpacing:0.6,textTransform:"uppercase",marginBottom:6,opacity:.9}}>Ficou no seu bolso</div>
            <div style={{color:"#fff",fontWeight:900,fontSize:38,fontFamily:"'Sora',sans-serif",lineHeight:1}}>{formatMoeda(veredito.lucro)}</div>
            <div style={{color:"#ffffffcc",fontSize:12,marginTop:8}}>{positivo?"Bom trabalho hoje! 💪":"Atenção: o dia fechou no vermelho."}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <Metric label="Custo por km" value={`${formatMoeda(custoKmV)}${veredito.km>0?"/km":""}`} sub={`${formatDecimal(veredito.km,1)} km rodados`} icon={RouteIcon} color={C.navy} bg={C.navyLight}/>
            <Metric label="Valor recebido" value={formatMoeda(veredito.valorRecebido)} sub={veredito.servico} icon={DollarSignIcon} color={C.green} bg={C.greenLight}/>
            <Metric label="Combustível" value={formatMoeda(veredito.combustivelCalculado)} sub="abastecido" icon={FuelIcon} color={C.orange} bg={C.orangeLight}/>
            <Metric label="Custo total" value={formatMoeda(veredito.custoTotal)} sub={veredito.pedagioOutros>0?`+ ${formatMoeda(veredito.pedagioOutros)} extras`:"comb. + extras"} icon={CalculatorIcon} color={C.red} bg={C.redLight}/>
          </div>
          {(veredito.custoVeiculo||0)>0&&(
            <div style={{background:C.navyLight,border:`1px solid ${C.navy}22`,borderRadius:12,padding:"12px 15px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{color:C.text2,fontSize:13,fontWeight:700}}>🚗 Desgaste do veículo</span>
              <span style={{color:C.navy,fontWeight:900,fontSize:16,fontFamily:"'Sora',sans-serif"}}>{formatMoeda(veredito.custoVeiculo)}</span>
            </div>
          )}
          <div style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,padding:"11px 14px",color:C.muted,fontSize:12,lineHeight:1.5}}>
            ✅ Lançado no Financeiro: entrada de {formatMoeda(veredito.valorRecebido)} e saída de {formatMoeda(veredito.custoTotal)} em Despesas.
          </div>
          {veredito.observacoes&&(
            <div style={{background:"#fff",border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px"}}>
              <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase",marginBottom:6}}>Observações</div>
              <div style={{color:C.text2,fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{veredito.observacoes}</div>
            </div>
          )}
          <PrimaryBtn onClick={onClose} variant="navy" style={{width:"100%"}}>Concluir</PrimaryBtn>
        </div>
      </ModalWrap>
    );
  }

  return(
    <ModalWrap maxW={460}>
      <ModalHeader title="🌙 Fechar meu dia" sub="Registre a jornada e veja seu lucro real" icon={DollarSignIcon} iconColor={C.navy} onClose={onClose}/>
      <ModalFormLayout footer={
        <PrimaryBtn onClick={salvar} variant="navy" disabled={salvando} style={{width:"100%"}}>
          {salvando?"Salvando…":"Fechar o dia →"}
        </PrimaryBtn>
      }>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {erro&&<div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",color:"#DC2626",fontSize:13,fontWeight:600}}>⚠️ {erro}</div>}

          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <label style={{color:C.text2,fontSize:14,fontWeight:700,letterSpacing:0.4}}>Serviço</label>
            <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
              {servicos.map(s=>{
                const custom=isServicoCustom(s);
                const ativo=servico===s;
                return(
                  <button key={s} type="button" onClick={()=>setServico(s)}
                    style={{position:"relative",background:ativo?C.navy:C.subtle,border:`1.5px solid ${ativo?C.navy:C.border}`,borderRadius:20,padding:custom?"7px 28px 7px 14px":"7px 14px",cursor:"pointer",color:ativo?"#fff":C.text2,fontSize:13,fontWeight:700}}>
                    {s}
                    {custom&&(
                      <span role="button" tabIndex={0} aria-label={`Remover ${s}`}
                        onClick={(e)=>{e.stopPropagation();removerServico(s);}}
                        onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.stopPropagation();e.preventDefault();removerServico(s);}}}
                        style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",width:18,height:18,borderRadius:"50%",background:ativo?"#ffffff33":"#fff",border:`1px solid ${ativo?"#ffffff55":C.border}`,color:ativo?"#fff":C.muted,fontSize:14,lineHeight:"16px",textAlign:"center",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        ×
                      </span>
                    )}
                  </button>
                );
              })}
              <button type="button" onClick={()=>setShowAddServ(v=>!v)}
                style={{background:"#fff",border:`1.5px dashed ${C.orange}`,borderRadius:20,padding:"7px 14px",cursor:"pointer",color:C.orange,fontSize:13,fontWeight:700}}>
                ＋ Adicionar serviço
              </button>
            </div>
            {showAddServ&&(
              <div style={{display:"flex",gap:8,marginTop:4}}>
                <input value={novoServ} onChange={e=>setNovoServ(e.target.value)} placeholder="Ex: Rappi, Loggi, particular" autoComplete="off"
                  onKeyDown={e=>{if(e.key==="Enter")adicionarServico();}}
                  style={{flex:1,minWidth:0,background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:"10px 12px",fontSize:14,outline:"none",boxSizing:"border-box"}}/>
                <PrimaryBtn onClick={adicionarServico} small>Salvar</PrimaryBtn>
              </div>
            )}
          </div>

          <div style={{color:C.muted,fontSize:12,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase"}}>O que você fez hoje</div>
          <Field label="🚗 Km rodado hoje" value={km} onChange={setKm} suffix="km" calc/>
          <Field label="💰 Valor recebido" value={valor} onChange={setValor} prefix="R$" calc/>
          <Field label="⛽ Combustível abastecido (valor total)" value={combustivelInput} onChange={setCombustivelInput} prefix="R$" calc/>
          <Field label="🅿️ Pedágio / outros gastos (opcional)" value={pedagio} onChange={setPedagio} prefix="R$" calc/>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <label style={{color:C.text2,fontSize:14,fontWeight:700,letterSpacing:0.4}}>📝 Observações (opcional)</label>
            <textarea value={observacoes} onChange={e=>setObservacoes(e.target.value)} placeholder="Anotações livres do dia…" rows={3} autoComplete="off"
              style={{width:"100%",background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:"10px 12px",fontSize:14,outline:"none",boxSizing:"border-box",resize:"vertical",minHeight:72,fontFamily:"inherit",lineHeight:1.45}}/>
          </div>

          {(valorNum>0||kmNum>0||combustivel>0)&&(
            <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:2}}>
              <div style={{color:C.muted,fontSize:12,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase"}}>Resultado do dia</div>
              {(custoVeiculo>0||pedagioNum>0||combustivel>0)&&(
                <div style={{background:"#F8FAFC",borderRadius:12,padding:"10px 14px",display:"flex",flexDirection:"column",gap:0}}>
                  {combustivel>0&&(
                    <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{color:C.text2,fontSize:13}}>⛽ Combustível</span>
                      <span style={{color:C.navy,fontWeight:700,fontSize:14}}>{formatMoeda(combustivel)}</span>
                    </div>
                  )}
                  {pedagioNum>0&&(
                    <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:custoVeiculo>0?`1px solid ${C.border}`:"none"}}>
                      <span style={{color:C.text2,fontSize:13}}>🅿️ Pedágio / outros</span>
                      <span style={{color:C.navy,fontWeight:700,fontSize:14}}>{formatMoeda(pedagioNum)}</span>
                    </div>
                  )}
                  {custoVeiculo>0&&(
                    <div style={{display:"flex",justifyContent:"space-between",padding:"8px 0"}}>
                      <span style={{color:C.text2,fontSize:13}}>🚗 Desgaste do veículo</span>
                      <span style={{color:C.navy,fontWeight:700,fontSize:14}}>{formatMoeda(custoVeiculo)}</span>
                    </div>
                  )}
                </div>
              )}
              {!(custoKmSalvo>0)&&(
                <button type="button" onClick={()=>onGoMeuVeiculo?.()} style={{background:"none",border:"none",padding:"4px 0",cursor:"pointer",color:C.navy,fontSize:12,fontWeight:600,textDecoration:"underline",textAlign:"left"}}>
                  Calcular o custo do meu veículo
                </button>
              )}
              <div style={{background:lucro>=0?C.greenLight:C.redLight,border:`1px solid ${lucro>=0?C.green:C.red}22`,borderRadius:12,padding:"13px 15px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:C.text2,fontSize:13,fontWeight:700}}>Ficou no seu bolso (lucro)</span>
                <span style={{color:lucro>=0?C.green:C.red,fontWeight:900,fontSize:20,fontFamily:"'Sora',sans-serif"}}>{formatMoeda(lucro)}</span>
              </div>
              <div style={{background:C.navyLight,border:`1px solid ${C.navy}22`,borderRadius:12,padding:"12px 15px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{color:C.text2,fontSize:13,fontWeight:700}}>Custo por km rodado</span>
                <span style={{color:C.navy,fontWeight:900,fontSize:18,fontFamily:"'Sora',sans-serif"}}>{formatMoeda(custoPorKmDia)}{kmNum>0?"/km":""}</span>
              </div>
            </div>
          )}
        </div>
      </ModalFormLayout>
    </ModalWrap>
  );
};

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
const Dashboard=({onNav,setShowCalc,setCalcMode,historicoFretes,jornadas=[],manutencoes,docs,despesas=[],perfil,onNovoChecklist,onUltimosChecklists,ultimosAvulsosCount=0,avulsosEmAndamento=[],onRetomarChecklist,onFecharDia,erroHistoricoSync})=>{
  const[showReferralSoon,setShowReferralSoon]=useState(false);
  const[toastIndicacao,setToastIndicacao]=useState("");
  const showToastIndicacao=(msg)=>{
    setToastIndicacao(msg||"");
    if(msg)setTimeout(()=>setToastIndicacao(""),3000);
  };
  const hoje=new Date();hoje.setHours(0,0,0,0);
  const docsVencendo=(docs||[]).filter(d=>{
    if(!d.expiry)return false;
    const[dia,mes,ano]=d.expiry.split("/");
    const exp=new Date(ano,mes-1,dia);
    const dias=Math.ceil((exp-hoje)/(1000*60*60*24));
    return dias<=60&&dias>=0;
  });
  const docsVencendo30=(docs||[]).filter(d=>{
    if(!d.expiry)return false;
    const[dia,mes,ano]=d.expiry.split("/");
    const exp=new Date(ano,mes-1,dia);
    const dias=Math.ceil((exp-hoje)/(1000*60*60*24));
    return dias<=30&&dias>=0;
  });
  const docsVencidos=(docs||[]).filter(d=>{
    if(!d.expiry)return false;
    const[dia,mes,ano]=d.expiry.split("/");
    const exp=new Date(ano,mes-1,dia);
    return Math.ceil((exp-hoje)/(1000*60*60*24))<0;
  });
  const maintList=manutencoes||[];
  const docsList=docs||[];
  const despList=despesas||[];
  const maintAlerts=maintList.filter(m=>m.status!=="ok").length;
  const totalManut=maintList.length;
  const totalFretes=historicoFretes?.length||0;
  const receitaTotal=roundMoney(historicoFretes?.reduce((a,f)=>a+(f.freteSugerido||0),0)||0);
  const semDados=totalFretes===0&&(jornadas||[]).length===0;
  const nomeMotorista=perfil?.nome?perfil.nome.split(" ")[0]:"Motorista";
  const hora=new Date().getHours();
  const saudacao=hora<12?"Bom dia":hora<18?"Boa tarde":"Boa noite";
  const mesAtual=new Date().getMonth();
  const anoAtual=new Date().getFullYear();
  const fretesMesAtual=(historicoFretes||[]).filter(f=>{
    if(!f.date)return false;
    const parts=f.date.split("/");
    if(parts.length<3)return false;
    return parseInt(parts[1])-1===mesAtual&&parseInt(parts[2])===anoAtual;
  });
  const faturamentoMes=roundMoney(fretesMesAtual.reduce((a,f)=>a+(f.freteSugerido||0),0));
  // V297 — jornadas (Fechamento do dia) contam junto com fretes no mês
  const jornadasMesAtual=(jornadas||[]).filter(j=>{
    const dt=j.data||j.date;
    if(!dt)return false;
    const parts=dt.split("/");
    if(parts.length<3)return false;
    return parseInt(parts[1])-1===mesAtual&&parseInt(parts[2])===anoAtual;
  });
  const jornadasReceitaMes=roundMoney(jornadasMesAtual.reduce((a,j)=>a+(j.valorRecebido||0),0));
  const qtdFretesMes=fretesMesAtual.length;
  const qtdJornadasMes=jornadasMesAtual.length;
  const viagensMesQtd=qtdFretesMes+qtdJornadasMes;
  const receitaMes=roundMoney(faturamentoMes+jornadasReceitaMes);
  // Saudação no padrão do Financeiro: deixa explícito fretes vs jornadas (sem misturar o total)
  const textoSaudacaoMes=(qtdFretesMes===0&&qtdJornadasMes===0)
    ?"Nenhuma viagem este mês ainda"
    :`${qtdFretesMes} ${qtdFretesMes===1?"viagem":"viagens"}${qtdJornadasMes>0?` + ${qtdJornadasMes} jornada${qtdJornadasMes===1?"":"s"}`:""} este mês · ${formatMoeda(receitaMes)}`;
  // Mesmo critério da aba Viagens: fretes + jornadas (total no histórico)
  const totalRegistrosViagens=totalFretes+(jornadas||[]).length;
  const subHistoricoViagens=totalRegistrosViagens===0?"Nenhuma viagem ainda":pluralRegistros(totalRegistrosViagens);
  const maintMesAtual=filtrarPorMesData(maintList,mesAtual,anoAtual);
  const despMesAtual=filtrarPorMesData(despList,mesAtual,anoAtual);
  const temMovimentoFinanceiroMes=qtdFretesMes>0||qtdJornadasMes>0||maintMesAtual.length>0||despMesAtual.length>0;
  const subFinanceiro=temMovimentoFinanceiroMes
    ?(receitaMes>0?`${formatMoeda(receitaMes)} este mês`:"Receitas e despesas")
    :"Sem dados ainda";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      {erroHistoricoSync&&(
        <div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:11,padding:"11px 14px",display:"flex",alignItems:"center",gap:8}}>
          <span style={{color:"#DC2626",fontSize:13,fontWeight:600}}>⚠️ Não foi possível atualizar seus dados. Verifique sua conexão.</span>
        </div>
      )}
      <div>
        <div style={{color:C.navy,fontSize:20,fontWeight:800,fontFamily:"'Sora',sans-serif",marginBottom:6}}>{saudacao}, {nomeMotorista}! 👋</div>
        <div style={{color:C.text2,fontSize:14,fontWeight:600,lineHeight:1.45,marginBottom:12}}>
          {textoSaudacaoMes}
        </div>

        {/* Botão indicação */}
        <a onClick={e=>{e.preventDefault();if(REFERRAL_ENABLED){void compartilharIndicacao(showToastIndicacao);}else{setShowReferralSoon(true);}}} href="#"
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"linear-gradient(135deg,#1E3A8A,#2952C8)",border:"none",borderRadius:14,padding:"11px 16px",cursor:"pointer",textDecoration:"none",marginBottom:4}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:34,height:34,borderRadius:"50%",background:"#ffffff22",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:16}}>👥</span>
            </div>
            <div>
              <div style={{color:"#fff",fontWeight:700,fontSize:13,fontFamily:"'Sora',sans-serif"}}>Indique um parceiro de estrada</div>
              <div style={{color:"#BFDBFE",fontSize:11,marginTop:1}}>Convide pelo WhatsApp</div>
            </div>
          </div>
          <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${C.orange},#FF9800)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <ArrowRightIcon size={13} color="#fff"/>
          </div>
        </a>
      </div>

      {/* Botão principal */}
      <button onClick={()=>{setCalcMode(null);setShowCalc(true);}} style={{background:"linear-gradient(135deg,#1E3A8A,#2952C8)",border:"1.5px solid #FF6A0033",borderRadius:16,padding:"20px 24px",cursor:"pointer",textAlign:"center",boxShadow:"0 4px 16px #1E3A8A33",display:"flex",flexDirection:"column",alignItems:"center",gap:10,width:"100%"}}>
        <div style={{width:48,height:48,borderRadius:"50%",background:`linear-gradient(135deg,${C.orange},#FF9800)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 3px 10px ${C.orange}44`}}>
          <RouteIcon size={22} color="#fff"/>
        </div>
        <div style={{color:"#fff",fontWeight:800,fontSize:20,fontFamily:"'Sora',sans-serif"}}>Calcular Rota</div>
        <div style={{background:"#ffffff18",border:"1px solid #ffffff22",borderRadius:20,padding:"5px 18px"}}>
          <span style={{color:"#fff",fontSize:13,fontWeight:600}}>🧮 Toque para calcular agora</span>
        </div>
      </button>

      {/* V291 — Fechamento do Dia */}
      <button onClick={()=>onFecharDia?.()} style={{background:"#fff",border:`1.5px solid ${C.orange}33`,borderRadius:16,padding:"15px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:13,width:"100%",boxShadow:"0 2px 10px #1E3A8A0D",textAlign:"left"}}>
        <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:20}}>🌙</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{color:C.navy,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif"}}>Fechar minha jornada</div>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>Uber, 99, iFood e outros · veja seu lucro real</div>
        </div>
        <ArrowRightIcon size={16} color={C.orange}/>
      </button>

      {/* Alertas — documentos vencidos */}
      {docsVencidos.length>0&&(
        <div style={{background:C.redLight,border:`1px solid ${C.red}44`,borderRadius:13,padding:"12px 16px",display:"flex",gap:10,alignItems:"center",cursor:"pointer"}} onClick={()=>onNav("documentos")}>
          <span style={{fontSize:20}}>🚨</span>
          <div style={{flex:1}}>
            <div style={{color:C.red,fontWeight:700,fontSize:14}}>{pluralDocumentosVencidos(docsVencidos.length)}</div>
            <div style={{color:C.red,fontSize:12,opacity:0.8}}>Toque para ver e regularizar agora</div>
          </div>
          <ArrowRightIcon size={14} color={C.red}/>
        </div>
      )}

      {/* Alertas — vencendo em até 30 dias */}
      {docsVencendo30.length>0&&(
        <div style={{background:C.redLight,border:`1px solid ${C.red}44`,borderRadius:13,padding:"12px 16px",display:"flex",gap:10,alignItems:"center",cursor:"pointer"}} onClick={()=>onNav("documentos")}>
          <span style={{fontSize:20}}>⚠️</span>
          <div style={{flex:1}}>
            <div style={{color:C.red,fontWeight:700,fontSize:14}}>{pluralDocumentosVence(docsVencendo30.length,30)}</div>
            <div style={{color:C.red,fontSize:12,opacity:0.8}}>Renove com urgência para evitar multas</div>
          </div>
          <ArrowRightIcon size={14} color={C.red}/>
        </div>
      )}

      {/* Alertas — vencendo entre 31 e 60 dias */}
      {docsVencendo.filter(d=>!docsVencendo30.includes(d)).length>0&&(
        <div style={{background:C.amberLight,border:`1px solid ${C.amber}44`,borderRadius:13,padding:"12px 16px",display:"flex",gap:10,alignItems:"center",cursor:"pointer"}} onClick={()=>onNav("documentos")}>
          <span style={{fontSize:20}}>📅</span>
          <div style={{flex:1}}>
            <div style={{color:C.amber,fontWeight:700,fontSize:14}}>{pluralDocumentosVence(docsVencendo.filter(d=>!docsVencendo30.includes(d)).length,60)}</div>
            <div style={{color:C.amber,fontSize:12,opacity:0.8}}>Planeje a renovação com antecedência</div>
          </div>
          <ArrowRightIcon size={14} color={C.amber}/>
        </div>
      )}

      {/* Alertas — manutenção */}
      {maintAlerts>0&&(
        <div style={{background:C.amberLight,border:`1px solid ${C.amber}44`,borderRadius:13,padding:"12px 16px",display:"flex",gap:10,alignItems:"center",cursor:"pointer"}} onClick={()=>onNav("manutencao")}>
          <WrenchIcon size={17} color={C.amber}/>
          <div style={{flex:1}}><div style={{color:C.amber,fontWeight:700,fontSize:14}}>{maintAlerts} {maintAlerts===1?"alerta":"alertas"} de manutenção</div></div>
          <ArrowRightIcon size={14} color={C.amber}/>
        </div>
      )}

      {semDados?(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{background:"linear-gradient(135deg,#1E3A8A08,#FF6A0006)",border:"1.5px solid #FF6A0022",borderRadius:18,padding:"22px 20px",textAlign:"center"}}>
            <div style={{fontSize:44,marginBottom:12}}>👋</div>
            <div style={{color:C.navy,fontWeight:800,fontSize:18,fontFamily:"'Sora',sans-serif",marginBottom:6}}>Bem-vindo ao LogRotas!</div>
            <div style={{color:C.text2,fontSize:14,lineHeight:1.6}}>Calcule fretes, otimize suas entregas e gerencie suas rotas com precisão. Tudo que o motorista autônomo precisa em um só lugar.</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{color:C.muted,fontSize:14,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"}}>Como funciona</div>
            {[
              {n:"1",emoji:"🗺️",t:"Calcule sua rota",d:"Frete ou viagem com KM real via Google Maps"},
              {n:"2",emoji:"📦",t:"Otimize suas entregas",d:"Leia romaneios e organize paradas automaticamente"},
              {n:"3",emoji:"💰",t:"Veja seu lucro",d:"Combustível, pedágio e margem calculados na hora"},
              {n:"4",emoji:"✅",t:"Confirme as entregas",d:"Acompanhe cada parada e registre as entregas"},
              {n:"5",emoji:"💾",t:"Salve no histórico",d:"Controle todos seus fretes e viagens"},
            ].map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:12,background:"#fff",borderRadius:13,padding:"12px 14px",boxShadow:"0 1px 4px #1E3A8A08",border:`1px solid ${C.border}`}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:C.orange,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{color:"#fff",fontWeight:800,fontSize:14}}>{s.n}</span>
                </div>
                <div>
                  <div style={{color:C.navy,fontWeight:700,fontSize:14}}>{s.emoji} {s.t}</div>
                  <div style={{color:C.muted,fontSize:12,marginTop:2}}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
          <Metric label="Viagens salvas" value={String(viagensMesQtd)} sub="este mês" trend="up" icon={CalculatorIcon} color={C.green} bg={C.greenLight}/>
          <Metric label="Receita total" value={formatMoeda(receitaMes)} sub="este mês" trend="up" icon={DollarSignIcon} color={C.orange} bg={C.orangeLight}/>
        </div>
      )}

      <div>
        <div style={{color:C.muted,fontSize:14,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginBottom:10}}>Acesso Rápido</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {label:"Histórico Viagens",sub:subHistoricoViagens,icon:CalculatorIcon,color:C.navy,page:"comparador"},
            {label:"Financeiro",sub:subFinanceiro,icon:BarChart3Icon,color:C.green,page:"financeiro"},
            {label:"Meu Veículo",sub:totalManut>0?pluralRegistros(totalManut):"Sem registros",icon:WrenchIcon,color:C.red,page:"manutencao"},
            {label:"Documentos",sub:docsVencidos.length>0?pluralDocumentosVencidos(docsVencidos.length):docsVencendo.length>0?`${docsVencendo.length} ${docsVencendo.length===1?"documento vencendo":"documentos vencendo"} em breve`:"Vencimentos",icon:FileTextIcon,color:docsVencidos.length>0?C.red:docsVencendo.length>0?C.amber:C.navy,page:"documentos"},
            {label:"Despesas",sub:despList.length>0?pluralRegistros(despList.length):"Refeições, hotel e mais",icon:DollarSignIcon,color:C.red,page:"despesas"},
            {label:"Meu Perfil",sub:"Configurações",icon:SettingsIcon,color:C.navy,page:"perfil"},
          ].map((s,i)=>(
            <button key={i} onClick={()=>onNav(s.page)} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"13px 15px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:11,boxShadow:"0 1px 4px #1E3A8A08"}}>
              <div style={{background:s.color+"18",borderRadius:10,padding:8,flexShrink:0}}><s.icon size={16} color={s.color}/></div>
              <div><div style={{color:C.text,fontWeight:700,fontSize:14}}>{s.label}</div><div style={{color:C.muted,fontSize:12,marginTop:2}}>{s.sub}</div></div>
            </button>
          ))}
          <button
            type="button"
            onClick={()=>onNovoChecklist?.()}
            style={{gridColumn:"1 / -1",background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"13px 15px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:11,boxShadow:"0 1px 4px #1E3A8A08"}}
          >
            <div style={{background:C.navy+"18",borderRadius:10,padding:8,flexShrink:0}}><PenLineIcon size={16} color={C.navy}/></div>
            <div>
              <div style={{color:C.text,fontWeight:700,fontSize:14}}>Novo Checklist</div>
              <div style={{color:C.muted,fontSize:12,marginTop:2}}>Checklist avulso de veículo</div>
            </div>
          </button>
          {avulsosEmAndamento.map((cl)=>{
            const {numero,data,endereco}=resumoChecklistAvulso(cl);
            return(
              <button
                key={cl.id}
                type="button"
                onClick={()=>onRetomarChecklist?.(cl)}
                style={{gridColumn:"1 / -1",background:C.orangeLight,border:`1px solid ${C.orange}44`,borderRadius:14,padding:"13px 15px",cursor:"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:11,boxShadow:"0 1px 4px #1E3A8A08"}}
              >
                <div style={{background:C.orange+"22",borderRadius:10,padding:8,flexShrink:0}}><RefreshCwIcon size={16} color={C.orange}/></div>
                <div>
                  <div style={{color:C.navy,fontWeight:800,fontSize:14}}>Retomar checklist</div>
                  <div style={{color:C.orange,fontSize:12,marginTop:2,fontWeight:600}}>
                    {getChecklistSyncBadge(cl)?`⏳ ${getChecklistPendingMediaLabel(cl)||"Sync pendente"} · `:""}
                    Coleta concluída — entrega pendente
                  </div>
                  <div style={{color:C.muted,fontSize:12,marginTop:4}}>Nº {numero} · {data} · {endereco}</div>
                </div>
              </button>
            );
          })}
          <button
            type="button"
            onClick={()=>onUltimosChecklists?.()}
            disabled={ultimosAvulsosCount===0}
            style={{gridColumn:"1 / -1",background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"13px 15px",cursor:ultimosAvulsosCount===0?"default":"pointer",textAlign:"left",display:"flex",alignItems:"center",gap:11,boxShadow:"0 1px 4px #1E3A8A08",opacity:ultimosAvulsosCount===0?0.65:1}}
          >
            <div style={{background:C.navy+"18",borderRadius:10,padding:8,flexShrink:0}}><FileTextIcon size={16} color={C.navy}/></div>
            <div>
              <div style={{color:C.text,fontWeight:700,fontSize:14}}>Últimos checklists</div>
              <div style={{color:C.muted,fontSize:12,marginTop:2}}>
                {ultimosAvulsosCount>0?`${ultimosAvulsosCount} checklist${ultimosAvulsosCount!==1?"s":""} recente${ultimosAvulsosCount!==1?"s":""}`:"Nenhum checklist recente"}
              </div>
            </div>
          </button>
        </div>
      </div>
      {showReferralSoon&&(
        <div style={{position:"fixed",inset:0,background:"#1E3A8A44",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowReferralSoon(false)}>
          <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,width:"100%",maxWidth:340,padding:26,textAlign:"center",boxShadow:"0 20px 60px #00000022"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:36,marginBottom:12}}>🚀</div>
            <div style={{color:C.navy,fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif",marginBottom:10}}>Em breve!</div>
            <div style={{color:C.text2,fontSize:14,marginBottom:22,lineHeight:1.55}}>O programa de indicação será ativado oficialmente após a fase beta.</div>
            <button onClick={()=>setShowReferralSoon(false)} style={{width:"100%",padding:"11px 0",background:C.navy,border:"none",borderRadius:11,color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>OK</button>
          </div>
        </div>
      )}
      {toastIndicacao&&(
        <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",zIndex:980,background:C.navy,color:"#fff",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:600,boxShadow:"0 4px 20px #00000033",maxWidth:"90%",textAlign:"center"}}>
          {toastIndicacao}
        </div>
      )}
    </div>
  );
};

// ── ROTAS ─────────────────────────────────────────────────────────────────────
const Rotas=()=>{
  const[routes,setRoutes]=useState(INIT_ROUTES);const[showAdd,setShowAdd]=useState(false);const[del,setDel]=useState(null);const[form,setForm]=useState({origin:"",dest:"",cargo:"",frete:"",date:""});const[stops,setStops]=useState([]);
  const add=()=>{setRoutes(p=>[{id:Date.now(),origin:form.origin||"Origem",dest:form.dest||"Destino",stops:stops.map(s=>s.v).filter(Boolean),distance:0,toll:0,fuel:0,status:"planejada",gain:parseNumeroBR(form.frete)||0,date:form.date||"—",cargo:form.cargo||"Geral"},...p]);setForm({origin:"",dest:"",cargo:"",frete:"",date:""});setStops([]);setShowAdd(false);};
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h1 style={{color:C.navy,fontSize:22,fontWeight:900,fontFamily:"'Sora',sans-serif",margin:0}}>Minhas Rotas</h1><PrimaryBtn onClick={()=>setShowAdd(true)} small><PlusIcon size={12}/> Nova Rota</PrimaryBtn></div>
      {routes.map(r=>{const lucro=r.gain-r.toll-r.fuel;const s=routeSt[r.status]||routeSt["planejada"];return(
        <Card key={r.id}><div style={{padding:"16px 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div><div style={{color:C.navy,fontWeight:700,fontSize:14}}>{r.origin} → {r.dest}</div>{r.stops?.length>0&&<div style={{color:C.muted,fontSize:12,marginTop:2}}>Via: {r.stops.join(" · ")}</div>}<div style={{color:C.muted,fontSize:12,marginTop:2}}>{r.cargo} · {r.date}</div></div>
            <div style={{display:"flex",alignItems:"center",gap:8}}><Tag label={s.label} color={s.color} bg={s.bg}/><button onClick={()=>setDel(r)} style={{background:C.redLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.red,display:"flex"}}><Trash2Icon size={14}/></button></div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {[
              {l:"Distância",v:`${r.distance} km`},
              {l:"Pedágio",v:formatMoeda(r.toll)},
              {l:"Combustível",v:formatMoeda(r.fuel)},
              {l:"Frete",v:formatMoeda(r.gain),c:C.green,bold:true},
              {l:"Lucro",v:formatMoeda(lucro||0),c:lucro>=0?C.green:C.red,bold:true},
              {l:"Receita por km (bruto)",v:formatMoedaKm(r.distance>0?(r.gain||0)/r.distance:0),c:C.navy},
              {l:"Lucro por km (líquido)",v:formatMoedaKm(r.distance>0?((lucro||0)/r.distance):0),c:lucro>=0?C.green:C.red},
            ].map((item,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:i<6?`1px solid ${C.border}`:"none"}}>
                <span style={{color:C.muted,fontSize:12}}>{item.l}</span><span style={{color:item.c||C.text,fontWeight:item.bold?800:600,fontSize:14}}>{item.v}</span>
              </div>
            ))}
          </div>
        </div></Card>
      );})}
      {showAdd&&(<ModalWrap><ModalHeader title="Nova Rota" icon={NavigationIcon} iconColor={C.orange} onClose={()=>setShowAdd(false)}/>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Field label="Origem" value={form.origin} onChange={v=>setForm(f=>({...f,origin:v}))} placeholder="São Paulo, SP"/>
          <StopsField stops={stops} setStops={setStops}/>
          <Field label="Destino" value={form.dest} onChange={v=>setForm(f=>({...f,dest:v}))} placeholder="Rio de Janeiro, RJ"/>
        </div>
        <PrimaryBtn onClick={add} style={{width:"100%",marginTop:16}}>Adicionar →</PrimaryBtn>
      </ModalWrap>)}
      {del&&<DeleteConfirm message={`Excluir rota "${del.origin} → ${del.dest}"?`} onConfirm={()=>{setRoutes(r=>r.filter(x=>x.id!==del.id));setDel(null);}} onCancel={()=>setDel(null)}/>}
    </div>
  );
};

// ── AGENDA ────────────────────────────────────────────────────────────────────
const Agenda=()=>{
  const[trips,setTrips]=useState(INIT_SCHED);const[showAdd,setShowAdd]=useState(false);const[del,setDel]=useState(null);const[form,setForm]=useState({origin:"",dest:"",date:"",time:"",cargo:"",frete:""});const[stops,setStops]=useState([]);
  const add=()=>{setTrips(p=>[...p,{id:Date.now(),...form,stops:stops.map(s=>s.v).filter(Boolean),frete:parseNumeroBR(form.frete)||0,status:"pendente"}]);setForm({origin:"",dest:"",date:"",time:"",cargo:"",frete:""});setStops([]);setShowAdd(false);};
  const byDate=trips.reduce((a,t)=>{if(!a[t.date])a[t.date]=[];a[t.date].push(t);return a;},{});
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h1 style={{color:C.navy,fontSize:22,fontWeight:900,fontFamily:"'Sora',sans-serif",margin:0}}>Agenda</h1><PrimaryBtn onClick={()=>setShowAdd(true)} small><PlusIcon size={12}/> Agendar</PrimaryBtn></div>
      {Object.entries(byDate).map(([date,dayTrips])=>(
        <div key={date}>
          <div style={{color:C.muted,fontSize:14,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginBottom:8,display:"flex",alignItems:"center",gap:6}}><CalendarIcon size={11}/> {date}</div>
          <Card>{dayTrips.map((t,i)=>{const s=schedSt[t.status]||schedSt.pendente;return(
            <div key={t.id} style={{padding:"14px 20px",borderBottom:i<dayTrips.length-1?`1px solid ${C.border}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:11}}>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginTop:4}}>
                  <div style={{width:9,height:9,borderRadius:"50%",background:s.color}}/><div style={{width:2,height:26,background:C.border,margin:"3px auto"}}/>
                </div>
                <div><div style={{color:C.muted,fontSize:10,marginBottom:3}}>{t.time}</div><div style={{color:C.navy,fontWeight:700}}>{t.origin}</div>{t.stops?.length>0&&<div style={{color:C.muted,fontSize:11}}>via {t.stops.join(", ")}</div>}<div style={{color:C.muted,fontSize:12}}>↓</div><div style={{color:C.navy,fontWeight:700}}>{t.dest}</div><div style={{color:C.muted,fontSize:12,marginTop:3}}>{t.cargo}</div></div>
              </div>
              <div style={{textAlign:"right",display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                {t.frete>0&&<div style={{color:C.green,fontWeight:900,fontSize:18,fontFamily:"'Sora',sans-serif"}}>{formatMoeda(t.frete)}</div>}
                <Tag label={s.label} color={s.color} bg={s.bg}/>
                <button onClick={()=>setDel(t)} style={{background:C.redLight,border:"none",borderRadius:8,padding:"5px 9px",cursor:"pointer",color:C.red,display:"flex",alignItems:"center",gap:4,fontSize:14,fontWeight:700}}><Trash2Icon size={12}/> Excluir</button>
              </div>
            </div>
          );})}
          </Card>
        </div>
      ))}
      {showAdd&&(<ModalWrap><ModalHeader title="Agendar Viagem" icon={CalendarIcon} iconColor={C.navy} onClose={()=>setShowAdd(false)}/>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Field label="Origem" value={form.origin} onChange={v=>setForm(f=>({...f,origin:v}))} placeholder="São Paulo, SP"/>
          <StopsField stops={stops} setStops={setStops}/>
          <Field label="Destino" value={form.dest} onChange={v=>setForm(f=>({...f,dest:v}))} placeholder="Rio de Janeiro, RJ"/>
          <DatePicker label="Data" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
          <Field label="Horário" value={form.time} onChange={v=>setForm(f=>({...f,time:v}))}/>
          <Field label="Tipo de Carga (opcional)" value={form.cargo} onChange={v=>setForm(f=>({...f,cargo:v}))} placeholder="Eletrônicos"/>
          <Field label="Valor do Frete (R$)" value={form.frete} onChange={v=>setForm(f=>({...f,frete:v}))} prefix="R$"/>
        </div>
        <PrimaryBtn onClick={add} style={{width:"100%",marginTop:16}}>Agendar →</PrimaryBtn>
      </ModalWrap>)}
      {del&&<DeleteConfirm message={`Excluir viagem "${del.origin} → ${del.dest}" do dia ${del.date}?`} onConfirm={()=>{setTrips(t=>t.filter(x=>x.id!==del.id));setDel(null);}} onCancel={()=>setDel(null)}/>}
    </div>
  );
};

// ── COMPARADOR ────────────────────────────────────────────────────────────────
const freteRuaResumida=(endereco)=>{
  if(!endereco||typeof endereco!=="string")return endereco||"—";
  let s=endereco.split(",")[0].trim();
  s=s.replace(/\s+\d+\s*[A-Za-z0-9\-]*$/,"").trim();
  s=s.replace(/^\d+[,\s\-]+/,"").trim();
  return s||endereco.split(",")[0].trim()||endereco;
};
const freteCustoBreakdown=(f)=>{
  const hasBreakdown=f.energyCost!=null||f.custoComb!=null||f.combustivelCost!=null
    ||f.tollCost!=null||f.pedagio!=null||f.pedagioTotal!=null||Number(f.arlaCost||0)>0||Number(f.custoVeiculo||0)>0;
  const combVal=hasBreakdown?Number(f.energyCost??f.custoComb??f.combustivelCost??0):null;
  const pedRaw=f.tollCost??f.pedagio??f.pedagioTotal;
  const pedNum=pedRaw!=null&&pedRaw!==""?Number(pedRaw):null;
  const arla=Number(f.arlaCost||0);
  const custoVeiculo=Number(f.custoVeiculo||0);
  const showComb=hasBreakdown&&combVal>0;
  const showPed=pedNum!=null&&!Number.isNaN(pedNum)&&pedNum>0;
  const showArla=arla>0;
  const showDesgaste=Number.isFinite(custoVeiculo)&&custoVeiculo>0;
  const somaPartes=(combVal??0)+(showPed?pedNum:0)+(showArla?arla:0)+(showDesgaste?custoVeiculo:0);
  const custoTotal=Number(f.custoTotal||0)||(hasBreakdown?somaPartes:0);
  return{combVal,pedNum,arla,custoVeiculo,showComb,showPed,showArla,showDesgaste,hasBreakdown,custoTotal};
};
const freteMoeda=formatMoeda;
const freteMoedaKm=formatMoedaKm;
const freteParseData=(f)=>{
  const parts=(f?.date||"").split("/");
  if(parts.length!==3)return null;
  const dia=parseInt(parts[0],10);
  const mes=parseInt(parts[1],10);
  const ano=parseInt(parts[2],10);
  if(!mes||!ano)return null;
  const horaParts=(f.hora||"00:00").split(":");
  const h=parseInt(horaParts[0],10)||0;
  const min=parseInt(horaParts[1],10)||0;
  const ts=new Date(ano,mes-1,dia||1,h,min).getTime();
  return{mes,ano,key:`${ano}-${String(mes).padStart(2,"0")}`,ts};
};
const freteMesLabel=(mes,ano)=>{
  const nomes=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  return `${(nomes[mes-1]||"").toUpperCase()} ${ano}`.trim();
};
const freteFiltrarPeriodo=(fretes,filtro)=>{
  if(filtro==="todos")return[...fretes];
  const hoje=new Date();
  let mesAlvo=hoje.getMonth()+1;
  let anoAlvo=hoje.getFullYear();
  if(filtro==="passado"){
    if(mesAlvo===1){mesAlvo=12;anoAlvo-=1;}
    else mesAlvo-=1;
  }
  return fretes.filter(f=>{
    const p=freteParseData(f);
    return p&&p.mes===mesAlvo&&p.ano===anoAlvo;
  });
};
const freteAgruparPorMes=(fretes)=>{
  const sorted=[...fretes].sort((a,b)=>{
    const pa=freteParseData(a),pb=freteParseData(b);
    if(!pa&&!pb)return 0;
    if(!pa)return 1;
    if(!pb)return -1;
    return pb.ts-pa.ts;
  });
  const groups=[];
  const map=new Map();
  sorted.forEach(f=>{
    const p=freteParseData(f);
    const key=p?.key||"sem-data";
    if(!map.has(key)){
      const g={key,label:p?freteMesLabel(p.mes,p.ano):"SEM DATA",items:[]};
      map.set(key,g);
      groups.push(g);
    }
    map.get(key).items.push(f);
  });
  groups.sort((a,b)=>{
    if(a.key==="sem-data")return 1;
    if(b.key==="sem-data")return -1;
    return b.key.localeCompare(a.key);
  });
  return groups.map(g=>({
    ...g,
    qtd:g.items.length,
    totalFat:roundMoney(g.items.reduce((s,f)=>s+(f.freteSugerido||0),0)),
    totalLucro:roundMoney(g.items.reduce((s,f)=>s+(f.lucro||0),0)),
  }));
};
const FRETE_FILTRO_OPTS=[
  {id:"este",label:"Este mês"},
  {id:"passado",label:"Mês passado"},
  {id:"todos",label:"Todos"},
];
const freteValorBaseInfo=(f)=>{
  const minVal=Number(f.valorMinSaida??f.valorMinimoSaida??0);
  const kmInc=Number(f.kmInclusosMin??f.kmInclusosMinimo??0);
  if(minVal<=0||kmInc<=0)return null;
  const kmExc=Number(f.kmExcedente??Math.max(0,(Number(f.distance)||0)-kmInc));
  const vkm=Number(f.vkm||0);
  return{minVal,kmInc,kmExc,vkm};
};
const FRETE_DET_PAD=14;
const FRETE_DET_HIGHLIGHT=(extra={})=>({padding:`11px ${FRETE_DET_PAD}px`,margin:`0 -${FRETE_DET_PAD}px`,borderRadius:10,borderBottom:"none",...extra});
const freteDataHora=(f)=>{
  const d=f.date||"—";
  return f.hora?`${d} · ${f.hora}`:d;
};
// V297 — millis do createdAt (Firestore Timestamp / seconds / Date) p/ desempate de ordenação
const createdAtMillis=(c)=>{
  if(!c)return 0;
  if(typeof c.toMillis==="function")return c.toMillis();
  if(typeof c.seconds==="number")return c.seconds*1000;
  const t=new Date(c).getTime();
  return Number.isNaN(t)?0:t;
};
const horaFromCreatedAt=(c)=>{
  const ms=createdAtMillis(c);
  if(!ms)return "";
  const d=new Date(ms);
  const pad=(n)=>String(n).padStart(2,"0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
// V297 — data · hora da jornada (usa hora salva; fallback no createdAt p/ jornadas antigas)
const jornadaDataHora=(j)=>{
  const d=j.date||j.data||"—";
  const hora=j.hora||horaFromCreatedAt(j.createdAt);
  return hora?`${d} · ${hora}`:d;
};
const freteDetalheRotas=(f)=>{
  const lines=[{label:"Origem",rua:freteRuaResumida(f.origin)}];
  (f.paradas||[]).forEach((p,i)=>lines.push({label:`Parada ${i+2}`,rua:freteRuaResumida(p)}));
  lines.push({label:"Destino Final",rua:freteRuaResumida(f.dest)});
  return lines;
};
const FRETE_DET_L={color:"#4B5563",fontSize:15,fontWeight:600};
const FRETE_DET_V={color:C.text,fontWeight:600,fontSize:15,textAlign:"right"};
const FRETE_DET_ROW={display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:`1px solid ${C.border}`,gap:10};
const FreteDetRow=({label,value,valueStyle={},rowStyle={}})=>(
  <div style={{...FRETE_DET_ROW,...rowStyle}}>
    <span style={FRETE_DET_L}>{label}</span>
    <span style={{...FRETE_DET_V,...valueStyle}}>{value}</span>
  </div>
);
const isPerfilGuincheiro=(perfil)=>perfil?.tipo==="Guincheiro"||perfil?.profile==="guincheiro";
const Comparador=({historicoFretes,jornadas=[],onAddFrete,onUpdateFrete,onDeleteFrete,onUpdateJornada,onDeleteJornada,perfil,uid,onOpenChecklist})=>{
  const[del,setDel]=useState(null);
  const[erroDel,setErroDel]=useState("");
  const[erroForm,setErroForm]=useState("");
  const[detalhe,setDetalhe]=useState(null);
  const[showAdd,setShowAdd]=useState(false);
  const[editItem,setEditItem]=useState(null);
  // V296 — detalhe/edição/exclusão de jornada (Fechamento do dia)
  const[detalheJornada,setDetalheJornada]=useState(null);
  const[editJornada,setEditJornada]=useState(null);
  const[delJornada,setDelJornada]=useState(null);
  const[formJ,setFormJ]=useState({servico:"",date:"",km:"",valorRecebido:"",combustivel:"",pedagio:"",observacoes:""});
  const[savingJ,setSavingJ]=useState(false);
  const abrirEditJornada=(j)=>{
    setFormJ({
      servico:j.servico||"",
      date:j.date||j.data||"",
      km:j.km!=null?String(j.km):"",
      valorRecebido:j.valorRecebido!=null?String(j.valorRecebido):"",
      combustivel:j.combustivelCalculado!=null?String(j.combustivelCalculado):"",
      pedagio:j.pedagioOutros!=null?String(j.pedagioOutros):"",
      observacoes:j.observacoes||"",
    });
    setEditJornada(j);
    setDetalheJornada(null);
  };
  const salvarEditJornada=async()=>{
    if(!editJornada||savingJ)return;
    const combustivel=roundMoney(parseNumeroBR(formJ.combustivel)||0);
    const pedagio=roundMoney(parseNumeroBR(formJ.pedagio)||0);
    const valorRecebido=roundMoney(parseNumeroBR(formJ.valorRecebido)||0);
    const km=parseNumeroBR(formJ.km)||0;
    const custoKmSalvo=resolveCustoKmSalvo(readCustoVeiculoLocalCache());
    const custoVeiculo=roundMoney(custoKmSalvo>0&&km>0?custoKmSalvo*km:0);
    const custoTotal=roundMoney(combustivel+pedagio+custoVeiculo);
    const lucro=roundMoney(valorRecebido-custoTotal);
    const dados={
      servico:(formJ.servico||"").trim()||"Jornada",
      data:formJ.date||editJornada.data||editJornada.date||"",
      hora:editJornada.hora||horaFromCreatedAt(editJornada.createdAt)||formatNowBR().horario,
      km,valorRecebido,
      combustivelCalculado:combustivel,
      pedagioOutros:pedagio,
      custoVeiculo,
      custoTotal,lucro,
      observacoes:(formJ.observacoes||"").trim(),
    };
    setSavingJ(true);
    try{
      await onUpdateJornada?.(editJornada.id,dados);
      setEditJornada(null);
    }catch{/* mantém modal aberto */}
    finally{setSavingJ(false);}
  };
  const hojeC=new Date();
  const[mesSel,setMesSel]=useState(hojeC.getMonth());
  const[anoSel,setAnoSel]=useState(hojeC.getFullYear());
  const prevMes=()=>{if(mesSel===0){setMesSel(11);setAnoSel(a=>a-1);}else setMesSel(m=>m-1);};
  const nextMes=()=>{if(mesSel===11){setMesSel(0);setAnoSel(a=>a+1);}else setMesSel(m=>m+1);};
  const[checklistFrete,setChecklistFrete]=useState(null);
  const[checklistLoading,setChecklistLoading]=useState(false);
  const[form,setForm]=useState({origin:"",dest:"",date:"",distance:"",freteSugerido:"",custoTotal:"",lucro:"",vkm:"",adicional:"",veiculo:"",cargo:""});
  // V295 — fretes + jornadas (Fechamento do dia) convivem na mesma lista de Viagens
  const viagens=[
    ...(historicoFretes||[]).map(f=>({...f,_tipo:"frete"})),
    ...(jornadas||[]).map(j=>({...j,date:j.data||j.date||"",_tipo:"jornada"})),
  ];
  const temAlgum=viagens.length>0;
  // V297 — ordena por data/hora; jornadas antigas sem `hora` usam createdAt como desempate
  const sortMillis=(v)=>{
    const p=freteParseData(v);
    let base=p?.ts||0;
    if(!v.hora&&v.createdAt){const cm=createdAtMillis(v.createdAt);if(cm)base=cm;}
    return base;
  };
  const viagensMes=viagens
    .filter(v=>{const p=freteParseData(v);return p&&(p.mes-1)===mesSel&&p.ano===anoSel;})
    .sort((a,b)=>sortMillis(b)-sortMillis(a));
  const totalFatMes=roundMoney(viagensMes.reduce((s,v)=>s+(v._tipo==="jornada"?(v.valorRecebido||0):(v.freteSugerido||0)),0));
  const totalLucroMes=roundMoney(viagensMes.reduce((s,v)=>s+(v.lucro||0),0));
  const qtdFretes=viagensMes.filter(v=>v._tipo==="frete").length;
  const qtdJornadas=viagensMes.filter(v=>v._tipo==="jornada").length;
  const guincheiro=isPerfilGuincheiro(perfil);

  useEffect(()=>{
    if(!detalhe||!uid||!guincheiro){setChecklistFrete(null);return;}
    let cancelled=false;
    setChecklistLoading(true);
    buscarChecklistPorFrete(uid,detalhe.id)
      .then((c)=>{if(!cancelled)setChecklistFrete(c);})
      .catch(()=>{if(!cancelled)setChecklistFrete(null);})
      .finally(()=>{if(!cancelled)setChecklistLoading(false);});
    return()=>{cancelled=true;};
  },[detalhe,uid,guincheiro]);

  const add=async()=>{
    const now=new Date();
    const item={...form,
      date:form.date||now.toLocaleDateString("pt-BR"),
      hora:now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}),
      freteSugerido:parseNumeroBR(form.freteSugerido)||0,
      custoTotal:parseNumeroBR(form.custoTotal)||0,
      lucro:parseNumeroBR(form.lucro)||0,
      distance:parseNumeroBR(form.distance)||0,
    };
    setErroForm("");
    try{
      await onAddFrete?.(item);
      setForm({origin:"",dest:"",date:"",distance:"",freteSugerido:"",custoTotal:"",lucro:"",vkm:"",adicional:"",veiculo:"",cargo:""});
      setShowAdd(false);
    }catch{
      setErroForm("Não foi possível salvar. Verifique sua conexão e tente novamente.");
    }
  };

  const saveEdit=async()=>{
    const updated={...editItem,
      origin:form.origin||editItem.origin,dest:form.dest||editItem.dest,date:form.date||editItem.date,
      distance:parseNumeroBR(form.distance)||editItem.distance,veiculo:form.veiculo||editItem.veiculo,
      cargo:form.cargo||editItem.cargo,vkm:form.vkm||editItem.vkm,adicional:form.adicional||editItem.adicional,
      custoTotal:parseNumeroBR(form.custoTotal)||editItem.custoTotal,
      freteSugerido:parseNumeroBR(form.freteSugerido)||editItem.freteSugerido,
      lucro:(parseNumeroBR(form.freteSugerido)||editItem.freteSugerido)-(parseNumeroBR(form.custoTotal)||editItem.custoTotal),
    };
    setErroForm("");
    try{
      await onUpdateFrete?.(updated);
      setEditItem(null);
      setForm({origin:"",dest:"",date:"",distance:"",freteSugerido:"",custoTotal:"",lucro:"",vkm:"",adicional:"",veiculo:"",cargo:""});
    }catch{
      setErroForm("Não foi possível atualizar. Verifique sua conexão e tente novamente.");
    }
  };

  const startEdit=(h)=>{
    setEditItem(h);
    setForm({origin:h.origin||"",dest:h.dest||"",date:h.date||"",distance:String(h.distance||""),freteSugerido:String(h.freteSugerido||""),custoTotal:String(h.custoTotal||""),lucro:String(h.lucro||""),vkm:h.vkm||"",adicional:h.adicional||"",veiculo:h.veiculo||"",cargo:h.cargo||""});
    setDetalhe(null);
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{textAlign:"center"}}>
        <h1 style={{color:C.navy,fontSize:22,fontWeight:900,fontFamily:"'Sora',sans-serif",margin:0}}>Histórico de Viagens</h1>
      </div>

      <MonthNav mes={mesSel} ano={anoSel} onPrev={prevMes} onNext={nextMes}/>

      {!temAlgum&&(
        <div style={{background:`linear-gradient(135deg,${C.navy}06,${C.orange}04)`,border:`1.5px dashed ${C.orange}44`,borderRadius:16,padding:"36px 20px",textAlign:"center"}}>
          <div style={{fontSize:44,marginBottom:12}}>🚛</div>
          <div style={{color:C.navy,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif",marginBottom:6}}>Nenhuma viagem ainda</div>
          <div style={{color:C.muted,fontSize:14,lineHeight:1.6,marginBottom:16}}>Calcule uma rota na tela inicial, salve como "Já foi realizado" ou feche seu dia — e aparece aqui automaticamente.</div>
          <div style={{display:"inline-block",background:C.orange,borderRadius:20,padding:"6px 16px"}}>
            <span style={{color:"#fff",fontSize:12,fontWeight:700}}>💡 Dica: salve sua primeira viagem e veja o financeiro ganhar vida</span>
          </div>
        </div>
      )}

      {temAlgum&&viagensMes.length===0&&(
        <div style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:16,padding:"36px 20px",textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:10,opacity:0.7}}>📭</div>
          <div style={{color:C.text2,fontWeight:700,fontSize:15,fontFamily:"'Sora',sans-serif"}}>Nenhuma viagem em {MESES_PT[mesSel]}</div>
        </div>
      )}

      {viagensMes.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{color:"#374151",fontSize:13,fontWeight:600,lineHeight:1.45,paddingBottom:8,borderBottom:`1px solid ${C.border}`}}>
            {qtdFretes>0?`${qtdFretes} ${qtdFretes===1?"viagem":"viagens"}`:""}{qtdFretes>0&&qtdJornadas>0?" · ":""}{qtdJornadas>0?`${qtdJornadas} ${qtdJornadas===1?"jornada":"jornadas"}`:""} · Faturamento {formatMoeda(totalFatMes)} · Lucro {formatMoeda(totalLucroMes)}
          </div>
          {viagensMes.map(h=>{
            const lucro=h.lucro||0;
            if(h._tipo==="jornada"){
              return(
                <div key={h.id} style={{border:`1px solid ${C.border}`,borderRadius:12,background:C.surface,overflow:"hidden"}}>
                  <button onClick={()=>setDetalheJornada(h)}
                    style={{width:"100%",background:"none",border:"none",cursor:"pointer",padding:"14px 16px",textAlign:"left",display:"block"}}>
                    <div style={{color:C.navy,fontWeight:700,fontSize:14,lineHeight:1.35,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span>{servicoEmoji(h.servico)} {h.servico||"Jornada"}</span>
                      <span style={{fontSize:10,fontWeight:700,color:C.green,background:C.greenLight,borderRadius:6,padding:"2px 7px"}}>Fechamento do dia</span>
                    </div>
                    <div style={{color:C.muted,fontSize:12,marginTop:4}}>
                      {jornadaDataHora(h)} · {h.km||0} km
                      {h.observacoes?` · ${h.observacoes.length>40?`${h.observacoes.slice(0,40)}…`:h.observacoes}`:""}
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginTop:8,gap:10}}>
                      <div style={{color:C.green,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif"}}>{freteMoeda(h.valorRecebido||0)}</div>
                      <div style={{color:C.muted,fontSize:11,flexShrink:0}}>Toque para detalhes →</div>
                    </div>
                    <div style={{color:lucro>=0?C.green:C.red,fontSize:12,fontWeight:600,marginTop:4}}>
                      Lucro: {freteMoeda(lucro)}
                    </div>
                  </button>
                </div>
              );
            }
            return(
              <div key={h.id} style={{border:`1px solid ${C.border}`,borderRadius:12,background:C.surface,overflow:"hidden"}}>
              <button onClick={()=>setDetalhe(h)}
                style={{width:"100%",background:"none",border:"none",cursor:"pointer",padding:"14px 16px",textAlign:"left",display:"block"}}>
                <div style={{color:C.navy,fontWeight:700,fontSize:14,lineHeight:1.35,display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                  <span>🚚</span>
                  <span style={{fontSize:10,fontWeight:700,color:C.navy,background:C.navyLight,borderRadius:6,padding:"2px 7px"}}>Frete</span>
                </div>
                <div style={{color:C.navy,fontWeight:700,fontSize:14,lineHeight:1.35,marginTop:4}}>
                  {freteRuaResumida(h.origin)} → {freteRuaResumida(h.dest)}
                </div>
                <div style={{color:C.muted,fontSize:12,marginTop:4}}>
                  {freteDataHora(h)} · {h.distance||0} km{h.veiculo?` · ${h.veiculo}`:""}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginTop:8,gap:10}}>
                  <div style={{color:C.green,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif"}}>{freteMoeda(h.freteSugerido)}</div>
                  <div style={{color:C.muted,fontSize:11,flexShrink:0}}>Toque para detalhes →</div>
                </div>
                <div style={{color:lucro>=0?C.green:C.red,fontSize:12,fontWeight:600,marginTop:4}}>
                  Lucro: {freteMoeda(lucro)}
                </div>
              </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de detalhes */}
      {detalhe&&(
        <ModalWrap maxW={440}>
          <div style={{position:"relative",marginBottom:16}}>
            <button onClick={()=>setDetalhe(null)} style={{position:"absolute",top:0,right:0,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:9,padding:7,cursor:"pointer",color:C.muted,display:"flex",zIndex:1}}><XIcon size={15}/></button>
            <div style={{textAlign:"center",padding:"0 36px"}}>
              <span style={{fontSize:22,lineHeight:1}}>🔄</span>
              <div style={{color:C.text,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif",marginTop:6}}>Detalhes da Viagem</div>
            </div>
            <div style={{marginTop:16,textAlign:"left"}}>
              {freteDetalheRotas(detalhe).map((item,i,arr)=>(
                <div key={i} style={{marginBottom:i<arr.length-1?14:0}}>
                  {i>0&&<div style={{color:"#9CA3AF",fontSize:13,padding:"10px 0 8px 2px",lineHeight:1}}>→</div>}
                  <div style={{color:"#6B7280",fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:0.4}}>{item.label}</div>
                  <div style={{color:"#1F2937",fontWeight:600,fontSize:15,marginTop:3,lineHeight:1.35}}>{item.rua}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Informações */}
          {(()=>{
            const baseInfo=freteValorBaseInfo(detalhe);
            const adicNum=Number(detalhe.adicional||0);
            const vkmNum=Number(detalhe.vkm||0);
            const infoRows=[
              {l:"Data",v:freteDataHora(detalhe)},
              {l:"Distância",v:`${detalhe.distance||0} km`},
              {l:"Veículo",v:detalhe.veiculo||"—"},
              {l:"Carga",v:detalhe.cargo||"—"},
              detalhe.observacao&&{l:"Observação",v:detalhe.observacao},
              {l:"Valor por km",v:vkmNum>0?freteMoedaKm(vkmNum):"—"},
              baseInfo&&{l:"Valor base",v:`${freteMoeda(baseInfo.minVal)} (inclui ${baseInfo.kmInc} km)`},
              baseInfo&&baseInfo.kmExc>0&&baseInfo.vkm>0&&{l:"Km excedentes",v:`${baseInfo.kmExc} km × ${freteMoedaKm(baseInfo.vkm)}`},
              adicNum>0&&{l:"Adicional fixo",v:freteMoeda(adicNum)},
            ].filter(Boolean);
            return(
              <div style={{display:"flex",flexDirection:"column",gap:0}}>
                {infoRows.map((r,i)=>(
                  <FreteDetRow key={i} label={r.l} value={r.v} valueStyle={r.l==="Observação"?{maxWidth:"58%"}:{}}/>
                ))}
              </div>
            );
          })()}

          <div style={{borderTop:`1px solid ${C.border}`,marginTop:10,marginBottom:6}}/>

          {/* Custos e resultado */}
          {(()=>{
            const{combVal,pedNum,arla,custoVeiculo,showComb,showPed,showArla,showDesgaste,custoTotal}=freteCustoBreakdown(detalhe);
            const lucroPos=(detalhe.lucro||0)>=0;
            const dist=Number(detalhe.distance)||0;
            return(
              <>
                {showComb&&<FreteDetRow label="Combustível" value={freteMoeda(combVal)}/>}
                {showPed&&<FreteDetRow label="Pedágio" value={freteMoeda(pedNum)}/>}
                {showArla&&<FreteDetRow label="ARLA 32" value={freteMoeda(arla)}/>}
                {showDesgaste&&<FreteDetRow label="🚗 Desgaste do veículo" value={freteMoeda(custoVeiculo)}/>}
                <FreteDetRow
                  label="Custo Total da Viagem"
                  value={freteMoeda(custoTotal)}
                  valueStyle={{color:C.red,fontWeight:"bold"}}
                  rowStyle={FRETE_DET_HIGHLIGHT({background:C.redLight,marginTop:4})}
                />
                <FreteDetRow
                  label="Frete Cobrado"
                  value={freteMoeda(detalhe.freteSugerido)}
                  valueStyle={{color:C.navy}}
                  rowStyle={FRETE_DET_HIGHLIGHT({background:C.navyLight,marginTop:12})}
                />
                <FreteDetRow
                  label="🟢 Meu Lucro"
                  value={freteMoeda(detalhe.lucro)}
                  valueStyle={{color:lucroPos?C.green:C.red,fontWeight:"bold"}}
                  rowStyle={FRETE_DET_HIGHLIGHT({background:lucroPos?C.greenLight:C.redLight,marginTop:8})}
                />
                {dist>0&&(
                  <>
                    <FreteDetRow
                      label="Receita por km"
                      value={freteMoedaKm((detalhe.freteSugerido||0)/dist)}
                      valueStyle={{color:C.navy}}
                      rowStyle={FRETE_DET_HIGHLIGHT({background:C.navyLight,marginTop:8})}
                    />
                    <FreteDetRow
                      label="Lucro por km"
                      value={freteMoedaKm((detalhe.lucro||0)/dist)}
                      valueStyle={{color:lucroPos?C.green:C.red}}
                      rowStyle={FRETE_DET_HIGHLIGHT({background:lucroPos?C.greenLight:C.redLight,marginTop:8})}
                    />
                  </>
                )}
              </>
            );
          })()}
          {guincheiro&&(
            <button
              type="button"
              disabled={checklistLoading}
              onClick={()=>{onOpenChecklist?.(detalhe,checklistFrete?.id?checklistFrete:null);setDetalhe(null);}}
              style={{width:"100%",minHeight:44,padding:"12px 16px",background:C.navyLight,border:`1.5px solid ${C.navy}33`,borderRadius:11,cursor:checklistLoading?"wait":"pointer",color:C.navy,fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:14,opacity:checklistLoading?0.7:1,fontFamily:"'Sora',sans-serif"}}>
              {checklistLoading?"⏳ Carregando…":checklistFrete?"📋 Ver Checklist":"📋 Iniciar Checklist"}
            </button>
          )}
          <div style={{display:"flex",gap:9,marginTop:16}}>
            <button onClick={()=>{setDel(detalhe);setErroDel("");setDetalhe(null);}}
              style={{flex:1,minHeight:44,padding:"12px 8px",background:C.redLight,border:`1px solid ${C.red}33`,borderRadius:11,cursor:"pointer",color:C.red,fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <Trash2Icon size={13}/> Excluir
            </button>
            <button onClick={()=>startEdit(detalhe)}
              style={{flex:1,minHeight:44,padding:"12px 8px",background:C.navyLight,border:`1px solid ${C.navy}33`,borderRadius:11,cursor:"pointer",color:C.navy,fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              <EditIcon size={13}/> Editar
            </button>
            <button onClick={()=>setDetalhe(null)}
              style={{flex:1,minHeight:44,padding:"12px 8px",background:C.orange,border:"none",borderRadius:11,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:`0 3px 10px ${C.orange}44`,fontFamily:"'Sora',sans-serif"}}>
              Fechar
            </button>
          </div>
          {/* Compartilhar pelo WhatsApp */}
          {(()=>{
            const empresaTopo=(perfil?.empresa||"").trim();
            const msg=(empresaTopo?`*${empresaTopo}*\n\n`:"")+`🚛 *Orçamento de Frete*\n\n📍 *Origem:* ${detalhe.origin||""}\n🏁 *Destino:* ${detalhe.dest||""}\n📏 *Distância:* ${detalhe.distance||0} km\n💰 *Valor do frete:* ${freteMoeda(detalhe.freteSugerido)}\n`+(detalhe.observacao?`📝 *Obs:* ${detalhe.observacao}\n`:"")+`\n_Cotação gerada pelo app LogRotas_`;
            return(
              <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
                style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#22C55E",borderRadius:11,padding:"11px 0",color:"#fff",fontWeight:700,fontSize:14,textDecoration:"none",marginTop:4}}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.537 4.049 1.475 5.757L.057 23.928c-.046.228.13.445.362.445a.42.42 0 00.102-.013l6.345-1.646A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.712 9.712 0 01-4.943-1.349l-.354-.209-3.664.95.982-3.561-.231-.371A9.712 9.712 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
                Compartilhar pelo WhatsApp
              </a>
            );
          })()}
        </ModalWrap>
      )}

      {/* Modal de adicionar manual */}
      {showAdd&&(
        <ModalWrap>
          <ModalHeader title="Registrar Frete" sub="Adicionar ao histórico manualmente" icon={PlusIcon} iconColor={C.orange} onClose={()=>{setShowAdd(false);setErroForm("");}}/>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <Field label="Origem" value={form.origin} onChange={v=>setForm(f=>({...f,origin:v}))} placeholder="São Paulo, SP"/>
            <StopsField stops={stops} setStops={setStops}/>
            <Field label="Destino" value={form.dest} onChange={v=>setForm(f=>({...f,dest:v}))} placeholder="Rio de Janeiro, RJ"/>
            <DatePicker label="Data" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
            <Field label="KM Total" value={form.distance} onChange={v=>setForm(f=>({...f,distance:v}))} suffix="km"/>
            <Field label="Veículo" value={form.veiculo} onChange={v=>setForm(f=>({...f,veiculo:v}))} placeholder="Caminhão"/>
            <Field label="Tipo de Carga (opcional)" value={form.cargo} onChange={v=>setForm(f=>({...f,cargo:v}))} placeholder="Eletrônicos"/>
            <Field label="Valor por km (R$)" value={form.vkm} onChange={v=>setForm(f=>({...f,vkm:v}))} prefix="R$" suffix="/km"/>
            <Field label="Adicional fixo (R$)" value={form.adicional} onChange={v=>setForm(f=>({...f,adicional:v}))} prefix="R$"/>
            <Field label="Custo Total da Viagem (R$)" value={form.custoTotal} onChange={v=>setForm(f=>({...f,custoTotal:v}))} prefix="R$"/>
            <Field label="Frete Cobrado (R$)" value={form.freteSugerido} onChange={v=>setForm(f=>({...f,freteSugerido:v,lucro:String((parseNumeroBR(v)||0)-(parseNumeroBR(form.custoTotal)||0))}))} prefix="R$"/>
            {form.freteSugerido&&form.custoTotal&&(
              <div style={{background:C.navyLight,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                <span style={{color:C.text2,fontSize:12}}>Lucro calculado</span>
                <span style={{color:(parseNumeroBR(form.freteSugerido)-parseNumeroBR(form.custoTotal))>=0?C.green:C.red,fontWeight:800,fontSize:14}}>
                  {formatMoeda((parseNumeroBR(form.freteSugerido)||0)-(parseNumeroBR(form.custoTotal)||0))}
                </span>
              </div>
            )}
          </div>
          {erroForm&&<div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",color:"#DC2626",fontSize:13,fontWeight:600,marginTop:12}}>⚠️ {erroForm}</div>}
          <PrimaryBtn onClick={add} style={{width:"100%",marginTop:16}}>Salvar no Histórico →</PrimaryBtn>
        </ModalWrap>
      )}

      {del&&<DeleteConfirm message={`Excluir frete "${del.origin} → ${del.dest}"?`} error={erroDel} onConfirm={async()=>{setErroDel("");try{await onDeleteFrete?.(del.id);setDel(null);}catch{setErroDel("Não foi possível excluir. Verifique sua conexão e tente novamente.");}}} onCancel={()=>{setDel(null);setErroDel("");}}/>}

      {/* Modal de edição */}
      {editItem&&(<ModalWrap><ModalHeader title="Editar Frete" sub={`${editItem.origin} → ${editItem.dest}`} icon={EditIcon} iconColor={C.navy} onClose={()=>{setEditItem(null);setErroForm("");}}/>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Field label="Origem" value={form.origin} onChange={v=>setForm(f=>({...f,origin:v}))} placeholder="São Paulo, SP"/>
          <StopsField stops={[]} setStops={()=>{}}/>
          <Field label="Destino" value={form.dest} onChange={v=>setForm(f=>({...f,dest:v}))} placeholder="Rio de Janeiro, RJ"/>
          <DatePicker label="Data" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
          <Field label="KM Total" value={form.distance} onChange={v=>setForm(f=>({...f,distance:v}))} suffix="km"/>
          <Field label="Veículo" value={form.veiculo} onChange={v=>setForm(f=>({...f,veiculo:v}))} placeholder="Caminhão"/>
          <Field label="Tipo de Carga (opcional)" value={form.cargo} onChange={v=>setForm(f=>({...f,cargo:v}))} placeholder="Eletrônicos"/>
          <Field label="Custo Total (R$)" value={form.custoTotal} onChange={v=>setForm(f=>({...f,custoTotal:v}))} prefix="R$"/>
          <Field label="Frete Cobrado (R$)" value={form.freteSugerido} onChange={v=>setForm(f=>({...f,freteSugerido:v}))} prefix="R$"/>
          {form.freteSugerido&&form.custoTotal&&(
            <div style={{background:C.navyLight,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
              <span style={{color:C.text2,fontSize:12}}>Lucro calculado</span>
              <span style={{color:(parseNumeroBR(form.freteSugerido)-parseNumeroBR(form.custoTotal))>=0?C.green:C.red,fontWeight:800,fontSize:14}}>
                {formatMoeda((parseNumeroBR(form.freteSugerido)||0)-(parseNumeroBR(form.custoTotal)||0))}
              </span>
            </div>
          )}
        </div>
        {erroForm&&<div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",color:"#DC2626",fontSize:13,fontWeight:600,marginTop:12}}>⚠️ {erroForm}</div>}
        <PrimaryBtn onClick={saveEdit} style={{width:"100%",marginTop:16}}>✓ Salvar Alterações</PrimaryBtn>
      </ModalWrap>)}

      {/* V296 — Detalhes do serviço (jornada / Fechamento do dia) */}
      {detalheJornada&&(()=>{
        const j=detalheJornada;
        const lucro=j.lucro||0;
        const km=j.km||0;
        const lucroKmJ=km>0?roundMoney(lucro/km):0;
        const pos=lucro>=0;
        const dataJ=jornadaDataHora(j);
        const msg=`${servicoEmoji(j.servico)} *${j.servico||"Jornada"}* — Fechamento do dia\n\n📅 ${dataJ}\n🛣️ ${km} km\n⛽ Combustível: ${freteMoeda(j.combustivelCalculado||0)}\n🅿️ Pedágio/outros: ${freteMoeda(j.pedagioOutros||0)}${(j.custoVeiculo||0)>0?`\n🚗 Desgaste do veículo: ${freteMoeda(j.custoVeiculo)}`:""}\n💸 Custo total: ${freteMoeda(j.custoTotal||0)}\n💰 Recebido: ${freteMoeda(j.valorRecebido||0)}\n🟢 Lucro: ${freteMoeda(lucro)}${j.observacoes?`\n📝 Obs: ${j.observacoes}`:""}\n\n_Gerado pelo LogRotas_`;
        return(
          <ModalWrap maxW={440}>
            <div style={{position:"relative",marginBottom:16}}>
              <button onClick={()=>setDetalheJornada(null)} style={{position:"absolute",top:0,right:0,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:9,padding:7,cursor:"pointer",color:C.muted,display:"flex",zIndex:1}}><XIcon size={15}/></button>
              <div style={{textAlign:"center",padding:"0 36px"}}>
                <span style={{fontSize:22,lineHeight:1}}>{servicoEmoji(j.servico)}</span>
                <div style={{color:C.text,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif",marginTop:6}}>Detalhes do serviço</div>
                <div style={{color:C.muted,fontSize:13,marginTop:2}}>{j.servico||"Jornada"} · {dataJ}</div>
              </div>
            </div>
            <div>
              <FreteDetRow label="Serviço" value={j.servico||"Jornada"}/>
              <FreteDetRow label="Data" value={dataJ}/>
              <FreteDetRow label="Km rodado" value={`${km} km`}/>
              <FreteDetRow label="Combustível" value={freteMoeda(j.combustivelCalculado||0)}/>
              <FreteDetRow label="Pedágio / outros" value={freteMoeda(j.pedagioOutros||0)}/>
              {(j.custoVeiculo||0)>0&&<FreteDetRow label="🚗 Desgaste do veículo" value={freteMoeda(j.custoVeiculo||0)}/>}
              <FreteDetRow label="Custo total" value={freteMoeda(j.custoTotal||0)} valueStyle={{color:C.red,fontWeight:"bold"}} rowStyle={FRETE_DET_HIGHLIGHT({background:C.redLight,marginTop:4})}/>
              <FreteDetRow label="Valor recebido" value={freteMoeda(j.valorRecebido||0)} valueStyle={{color:C.navy}} rowStyle={FRETE_DET_HIGHLIGHT({background:C.navyLight,marginTop:12})}/>
              <FreteDetRow label="🟢 Lucro" value={freteMoeda(lucro)} valueStyle={{color:pos?C.green:C.red,fontWeight:"bold"}} rowStyle={FRETE_DET_HIGHLIGHT({background:pos?C.greenLight:C.redLight,marginTop:8})}/>
              <FreteDetRow label="Lucro por km" value={freteMoedaKm(lucroKmJ)} valueStyle={{color:pos?C.green:C.red}} rowStyle={FRETE_DET_HIGHLIGHT({background:pos?C.greenLight:C.redLight,marginTop:8})}/>
              {j.observacoes&&(
                <div style={{marginTop:12,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px"}}>
                  <div style={{color:C.muted,fontSize:11,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase",marginBottom:6}}>Observações</div>
                  <div style={{color:C.text2,fontSize:13,lineHeight:1.5,whiteSpace:"pre-wrap"}}>{j.observacoes}</div>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:9,marginTop:16}}>
              <button onClick={()=>{setDelJornada(j);setDetalheJornada(null);}}
                style={{flex:1,minHeight:44,padding:"12px 8px",background:C.redLight,border:`1px solid ${C.red}33`,borderRadius:11,cursor:"pointer",color:C.red,fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                <Trash2Icon size={13}/> Excluir
              </button>
              <button onClick={()=>abrirEditJornada(j)}
                style={{flex:1,minHeight:44,padding:"12px 8px",background:C.navyLight,border:`1px solid ${C.navy}33`,borderRadius:11,cursor:"pointer",color:C.navy,fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                <EditIcon size={13}/> Editar
              </button>
              <button onClick={()=>setDetalheJornada(null)}
                style={{flex:1,minHeight:44,padding:"12px 8px",background:C.orange,border:"none",borderRadius:11,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",gap:6,boxShadow:`0 3px 10px ${C.orange}44`,fontFamily:"'Sora',sans-serif"}}>
                Fechar
              </button>
            </div>
            <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
              style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:"#22C55E",borderRadius:11,padding:"11px 0",color:"#fff",fontWeight:700,fontSize:14,textDecoration:"none",marginTop:12}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.089.537 4.049 1.475 5.757L.057 23.928c-.046.228.13.445.362.445a.42.42 0 00.102-.013l6.345-1.646A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.712 9.712 0 01-4.943-1.349l-.354-.209-3.664.95.982-3.561-.231-.371A9.712 9.712 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
              Compartilhar pelo WhatsApp
            </a>
          </ModalWrap>
        );
      })()}

      {/* V296 — Editar serviço (jornada) */}
      {editJornada&&(()=>{
        const lucroPrev=(()=>{
          const comb=parseNumeroBR(formJ.combustivel)||0;
          const ped=parseNumeroBR(formJ.pedagio)||0;
          const kmE=parseNumeroBR(formJ.km)||0;
          const ck=resolveCustoKmSalvo(readCustoVeiculoLocalCache());
          const desgaste=ck>0&&kmE>0?ck*kmE:0;
          return roundMoney((parseNumeroBR(formJ.valorRecebido)||0)-(comb+ped+desgaste));
        })();
        return(
          <ModalWrap><ModalHeader title="Editar serviço" sub={`${editJornada.servico||"Jornada"} · ${editJornada.date||editJornada.data||"—"}`} icon={EditIcon} iconColor={C.navy} onClose={()=>setEditJornada(null)}/>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <Field label="Serviço" value={formJ.servico} onChange={v=>setFormJ(f=>({...f,servico:v}))} placeholder="Uber, iFood, 99…"/>
              <DatePicker label="Data" value={formJ.date} onChange={v=>setFormJ(f=>({...f,date:v}))}/>
              <Field label="Km rodado" value={formJ.km} onChange={v=>setFormJ(f=>({...f,km:v}))} suffix="km"/>
              <Field label="Valor recebido" value={formJ.valorRecebido} onChange={v=>setFormJ(f=>({...f,valorRecebido:v}))} prefix="R$"/>
              <Field label="Combustível (valor total)" value={formJ.combustivel} onChange={v=>setFormJ(f=>({...f,combustivel:v}))} prefix="R$"/>
              <Field label="Pedágio / outros" value={formJ.pedagio} onChange={v=>setFormJ(f=>({...f,pedagio:v}))} prefix="R$"/>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                <label style={{color:C.text2,fontSize:14,fontWeight:700,letterSpacing:0.4}}>Observações (opcional)</label>
                <textarea value={formJ.observacoes} onChange={e=>setFormJ(f=>({...f,observacoes:e.target.value}))} placeholder="Anotações livres do dia…" rows={3}
                  style={{width:"100%",background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:10,color:C.text,padding:"10px 12px",fontSize:14,outline:"none",boxSizing:"border-box",resize:"vertical",minHeight:72,fontFamily:"inherit",lineHeight:1.45}}/>
              </div>
              <div style={{background:C.navyLight,borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between"}}>
                <span style={{color:C.text2,fontSize:12}}>Lucro calculado</span>
                <span style={{color:lucroPrev>=0?C.green:C.red,fontWeight:800,fontSize:14}}>{formatMoeda(lucroPrev)}</span>
              </div>
            </div>
            <PrimaryBtn onClick={salvarEditJornada} style={{width:"100%",marginTop:16}}>{savingJ?"Salvando…":"✓ Salvar Alterações"}</PrimaryBtn>
          </ModalWrap>
        );
      })()}

      {delJornada&&<DeleteConfirm message={`Excluir o serviço "${delJornada.servico||"Jornada"}" de ${delJornada.date||delJornada.data||"—"}?`} onConfirm={async()=>{await onDeleteJornada?.(delJornada.id);setDelJornada(null);}} onCancel={()=>setDelJornada(null)}/>}
    </div>
  );
};

// ── DESPESAS ──────────────────────────────────────────────────────────────────
const INIT_CAT_DESP=["Café da manhã","Almoço","Jantar","Hotel","Combustível","Outros"];
const Despesas=({despesas,onAddDespesa,onUpdateDespesa,onDeleteDespesa,uid,perfil})=>{
  const isPago=getPlanoAtual(perfil).isPago;
  const[limiteDesp,setLimiteDesp]=useState(false);
  const[categorias,setCategorias]=useState(INIT_CAT_DESP);
  const[showAdd,setShowAdd]=useState(false);
  const[showManageCat,setShowManageCat]=useState(false);
  const[del,setDel]=useState(null);
  const[newCat,setNewCat]=useState("");
  const[editCatIdx,setEditCatIdx]=useState(null);
  const[editCatVal,setEditCatVal]=useState("");
  const[form,setForm]=useState({categoria:"Café da manhã",descricao:"",valor:"",date:""});
  const[editingId,setEditingId]=useState(null);
  const[erroForm,setErroForm]=useState("");
  const[erroDel,setErroDel]=useState("");
  const hoje=new Date();
  const[mesSel,setMesSel]=useState(hoje.getMonth());
  const[anoSel,setAnoSel]=useState(hoje.getFullYear());
  const prevMes=()=>{if(mesSel===0){setMesSel(11);setAnoSel(a=>a-1);}else setMesSel(m=>m-1);};
  const nextMes=()=>{if(mesSel===11){setMesSel(0);setAnoSel(a=>a+1);}else setMesSel(m=>m+1);};
  // V293 — despesas vinculadas a jornada (jornadaId) contam em "Custo das viagens" no Financeiro,
  // então não aparecem mais na lista de Despesas para não duplicar.
  const despMes=filtrarPorMesData(despesas,mesSel,anoSel).filter(d=>!d.jornadaId);
  const total=despMes.reduce((a,d)=>a+(d.valor||0),0);

  useEffect(()=>{
    if(!uid||isPago)return;
    (async()=>{
      setLimiteDesp(!(await podeUsar(uid,"despesas",FREE_LIMITS.despesas)));
    })();
  },[uid,isPago]);

  const abrirRegistrar=async()=>{
    if(!editingId&&!isPago&&uid){
      const{bloqueado}=await checarLimiteFree(uid,perfil,"despesas");
      if(bloqueado){setLimiteDesp(true);return;}
    }
    setShowAdd(true);
  };

  const add=async()=>{
    setErroForm("");
    try{
      if(editingId){
        await onUpdateDespesa?.({id:editingId,...form,valor:parseNumeroBR(form.valor)||0});
        setEditingId(null);
      } else {
        if(!isPago&&uid){
          const{bloqueado}=await checarLimiteFree(uid,perfil,"despesas");
          if(bloqueado){setLimiteDesp(true);setShowAdd(false);return;}
        }
        await onAddDespesa?.({...form,valor:parseNumeroBR(form.valor)||0});
        if(!isPago&&uid){
          void incrementarUso(uid,"despesas");
          setLimiteDesp(!(await podeUsar(uid,"despesas",FREE_LIMITS.despesas)));
        }
      }
      setForm({categoria:"Café da manhã",descricao:"",valor:"",date:""});
      setShowAdd(false);
    }catch{
      setErroForm(editingId
        ?"Não foi possível atualizar. Verifique sua conexão e tente novamente."
        :"Não foi possível salvar. Verifique sua conexão e tente novamente.");
    }
  };

  // agrupar por categoria
  const porCat=categorias.map(cat=>({cat,items:despMes.filter(d=>d.categoria===cat)})).filter(g=>g.items.length>0);

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h1 style={{color:C.navy,fontSize:22,fontWeight:900,fontFamily:"'Sora',sans-serif",margin:0}}>Despesas</h1>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowManageCat(true)} style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:10,padding:"8px 12px",cursor:"pointer",color:C.text2,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:5}}><EditIcon size={12}/> Categorias</button>
          <PrimaryBtn onClick={abrirRegistrar} small disabled={limiteDesp&&!isPago}><PlusIcon size={12}/> Registrar</PrimaryBtn>
        </div>
      </div>

      {limiteDesp&&!isPago&&(
        <LimiteAtingido mensagem={MSG_LIMITE.despesas}/>
      )}

      <MonthNav mes={mesSel} ano={anoSel} onPrev={prevMes} onNext={nextMes}/>

      {/* Total */}
      {despMes.length>0&&(
        <div style={{background:"linear-gradient(135deg,#FFF1F2,#FECDD3)",border:`1px solid #FECDD3`,borderRadius:14,padding:"14px 18px",boxShadow:"0 2px 8px #FCA5A522"}}>
          <div style={{color:"#BE123C",fontSize:12,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase",marginBottom:4,opacity:0.85}}>Total de Despesas · {MESES_PT[mesSel]}</div>
          <div style={{color:"#9F1239",fontWeight:800,fontSize:24,fontFamily:"'Sora',sans-serif",lineHeight:1}}>{formatMoeda(total)}</div>
          <div style={{color:"#BE123C",fontSize:11,marginTop:4,opacity:0.75}}>{pluralRegistros(despMes.length)} · entram no Financeiro como saída</div>
        </div>
      )}

      {despMes.length===0&&(
        <div style={{background:C.subtle,border:`1px dashed ${C.border}`,borderRadius:14,padding:"32px 20px",textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:10}}>💸</div>
          <div style={{color:C.text,fontWeight:700,fontSize:14,marginBottom:6}}>Nenhuma despesa em {MESES_PT[mesSel]}</div>
          <div style={{color:C.muted,fontSize:14}}>Toque em + Registrar para adicionar</div>
        </div>
      )}

      {/* Por categoria */}
      {porCat.map(({cat,items})=>(
        items.length===1?(
          <Card key={cat}>
            <DespesaItem item={items[0]} last
              onEdit={()=>{setForm({categoria:items[0].categoria,descricao:items[0].descricao||"",valor:String(items[0].valor||""),date:items[0].date||""});setEditingId(items[0].id);setShowAdd(true);}}
              onDelete={()=>setDel(items[0])}/>
          </Card>
        ):(
          <Card key={cat}>
            <CardHeader title={cat} action={<span style={{color:C.red,fontWeight:700,fontSize:14}}>- {formatMoeda(items.reduce((a,i)=>a+(i.valor||0),0))}</span>}/>
            {items.map((item,i)=>(
              <DespesaItem key={item.id} item={item} last={i===items.length-1}
                onEdit={()=>{setForm({categoria:item.categoria,descricao:item.descricao||"",valor:String(item.valor||""),date:item.date||""});setEditingId(item.id);setShowAdd(true);}}
                onDelete={()=>setDel(item)}/>
            ))}
          </Card>
        )
      ))}

      {/* Modal registrar */}
      {showAdd&&(<ModalWrap><ModalHeader title={editingId?"Editar Despesa":"Registrar Despesa"} icon={DollarSignIcon} iconColor={C.red} onClose={()=>{setShowAdd(false);setEditingId(null);setErroForm("");setForm({categoria:"Café da manhã",descricao:"",valor:"",date:""});}}/>
        <ModalFormLayout footer={<PrimaryBtn onClick={add} variant="red" style={{width:"100%"}}>{editingId?"Salvar alterações →":"Salvar Despesa →"}</PrimaryBtn>}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              <label style={{color:C.text2,fontSize:14,fontWeight:700,letterSpacing:0.4}}>Categoria</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {categorias.map(cat=>(
                  <button key={cat} onClick={()=>setForm(f=>({...f,categoria:cat}))}
                    style={{background:form.categoria===cat?C.redLight:C.subtle,border:`1.5px solid ${form.categoria===cat?C.red:C.border}`,borderRadius:20,padding:"6px 14px",cursor:"pointer",color:form.categoria===cat?C.red:C.text2,fontSize:12,fontWeight:form.categoria===cat?700:400}}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Descrição (opcional)" value={form.descricao} onChange={v=>setForm(f=>({...f,descricao:v}))} placeholder="ex: Almoço em Campinas"/>
            <Field label="Valor (R$)" value={form.valor} onChange={v=>setForm(f=>({...f,valor:v}))} prefix="R$"/>
            <DatePicker fullScreen label="Data" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
            {erroForm&&<div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",color:"#DC2626",fontSize:13,fontWeight:600}}>⚠️ {erroForm}</div>}
          </div>
        </ModalFormLayout>
      </ModalWrap>)}

      {/* Sub-componente de item de despesa com editar + excluir */}

      {/* Modal gerenciar categorias */}
      {showManageCat&&(<ModalWrap><ModalHeader title="Categorias de Despesa" icon={EditIcon} iconColor={C.orange} onClose={()=>setShowManageCat(false)}/>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
          {categorias.map((cat,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:C.subtle,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.border}`}}>
              {editCatIdx===i
                ?<input value={editCatVal} onChange={e=>setEditCatVal(e.target.value)} style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14}} autoFocus/>
                :<span style={{flex:1,color:C.text,fontSize:14}}>{cat}</span>}
              <div style={{display:"flex",gap:6}}>
                {editCatIdx===i
                  ?<button onClick={()=>{if(editCatVal.trim()){setCategorias(cs=>cs.map((x,j)=>j===i?editCatVal.trim():x));setEditCatIdx(null);} }} style={{background:C.greenLight,border:"none",borderRadius:7,padding:"4px 9px",cursor:"pointer",color:C.green,fontWeight:700,fontSize:12}}>✓</button>
                  :<button onClick={()=>{setEditCatIdx(i);setEditCatVal(cat);}} style={{background:C.orangeLight,border:"none",borderRadius:7,padding:"4px 7px",cursor:"pointer",color:C.orange,display:"flex"}}><EditIcon size={12}/></button>}
                <button onClick={()=>setCategorias(cs=>cs.filter((_,j)=>j!==i))} style={{background:C.redLight,border:"none",borderRadius:7,padding:"4px 7px",cursor:"pointer",color:C.red,display:"flex"}}><Trash2Icon size={12}/></button>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={newCat} onChange={e=>setNewCat(e.target.value)} placeholder="Nova categoria..." onKeyDown={e=>{if(e.key==="Enter"&&newCat.trim()){setCategorias(c=>[...c,newCat.trim()]);setNewCat("");}}}
            style={{flex:1,background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:10,outline:"none",color:C.text,padding:"10px 12px",fontSize:14}}
            onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
          <PrimaryBtn onClick={()=>{if(!newCat.trim())return;setCategorias(c=>[...c,newCat.trim()]);setNewCat("");}} small><PlusIcon size={13}/></PrimaryBtn>
        </div>
      </ModalWrap>)}

      {del&&<DeleteConfirm message={`Excluir despesa "${del.descricao||del.categoria}" de ${formatMoeda(del.valor||0)}?`} error={erroDel} onConfirm={async()=>{setErroDel("");try{await onDeleteDespesa?.(del.id);setDel(null);}catch{setErroDel("Não foi possível excluir. Verifique sua conexão e tente novamente.");}}} onCancel={()=>{setDel(null);setErroDel("");}}/>}
    </div>
  );
};

const DespesaItem=({item,last,onEdit,onDelete})=>(
  <div style={{padding:"12px 20px",borderBottom:last?"":`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
    <div>
      <div style={{color:C.text,fontWeight:600,fontSize:14}}>{item.descricao||item.categoria}</div>
      <div style={{color:C.muted,fontSize:12,marginTop:2}}>{item.date||"—"}</div>
    </div>
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <span style={{color:C.red,fontWeight:800,fontSize:15}}>{formatMoeda(item.valor||0)}</span>
      <button onClick={onEdit} style={{background:C.orangeLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.orange,display:"flex"}}><EditIcon size={13}/></button>
      <button onClick={onDelete} style={{background:C.redLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.red,display:"flex"}}><Trash2Icon size={13}/></button>
    </div>
  </div>
);

// ── MANUTENÇÃO ────────────────────────────────────────────────────────────────
const maintMetaParts=(item)=>{
  const parts=[];
  if(item.vehicle?.trim())parts.push(item.vehicle.trim());
  if(item.date?.trim())parts.push(item.date.trim());
  if(item.km!=null&&String(item.km).trim()!=="")parts.push(`${formatKm(item.km)} km`);
  return parts;
};
const Manutencao=({manutencoes:items,onAddManutencao,onUpdateManutencao,onDeleteManutencao,uid,perfil,vehicles,setVehicles,historicoFretes=[],jornadas=[]})=>{
  const isPago=getPlanoAtual(perfil).isPago;
  const[limiteManut,setLimiteManut]=useState(false);
  const[stypes,setStypes]=useState(INIT_STYPE);const[showAdd,setShowAdd]=useState(false);const[showManage,setShowManage]=useState(false);const[del,setDel]=useState(null);const[erroForm,setErroForm]=useState("");const[erroDel,setErroDel]=useState("");const[editTIdx,setEditTIdx]=useState(null);const[editTVal,setEditTVal]=useState("");const[newType,setNewType]=useState("");const[form,setForm]=useState({type:"",vehicle:"",km:"",cost:"",nextKm:"",date:""});const[editingId,setEditingId]=useState(null);
  const[editVeh,setEditVeh]=useState(null);
  const[editVehVals,setEditVehVals]=useState({});
  const[custoForm,setCustoForm]=useState(()=>formFromCustoVeiculoPersist(readCustoVeiculoLocalCache()));
  const[custoAberto,setCustoAberto]=useState(false);
  const[salvandoCusto,setSalvandoCusto]=useState(false);
  const[custoMsg,setCustoMsg]=useState("");
  const[odometroSalvo,setOdometroSalvo]=useState(()=>{
    const c=readCustoVeiculoLocalCache();
    const n=Number(c?.odometro);
    return Number.isFinite(n)&&n>0?n:null;
  });
  const[odometroAtualizadoEm,setOdometroAtualizadoEm]=useState(()=>readCustoVeiculoLocalCache()?.odometroAtualizadoEm||null);
  const[editandoOdo,setEditandoOdo]=useState(false);
  const[draftOdo,setDraftOdo]=useState("");
  const[salvandoOdo,setSalvandoOdo]=useState(false);
  const custoSyncDoneRef=useRef(false);
  const[custoHydrated,setCustoHydrated]=useState(()=>!uid);
  const hoje=new Date();
  const[mesSel,setMesSel]=useState(hoje.getMonth());
  const[anoSel,setAnoSel]=useState(hoje.getFullYear());
  const prevMes=()=>{if(mesSel===0){setMesSel(11);setAnoSel(a=>a-1);}else setMesSel(m=>m-1);};
  const nextMes=()=>{if(mesSel===11){setMesSel(0);setAnoSel(a=>a+1);}else setMesSel(m=>m+1);};
  const itemsMes=filtrarPorMesData(items,mesSel,anoSel);
  const alerts=items.filter(i=>i.status!=="ok").length;
  const totalManut=itemsMes.reduce((a,i)=>a+(i.cost||0),0);
  const resetForm=()=>setForm({type:"",vehicle:"",km:"",cost:"",nextKm:"",date:""});
  const closeModal=()=>{setShowAdd(false);setEditingId(null);setErroForm("");resetForm();};
  const openEdit=(item)=>{
    setForm({type:item.type||"",vehicle:item.vehicle||"",km:item.km!=null?String(item.km):"",cost:item.cost!=null?String(item.cost):"",nextKm:item.nextKm!=null?String(item.nextKm):"",date:item.date||""});
    setEditingId(item.id);
    setShowAdd(true);
  };
  const startEditVeh=v=>{setEditVeh(v.id);setEditVehVals({consumption:String(v.consumption),axles:String(v.axles),kwh:String(v.kwh||"")});};
  const saveVeh=id=>{setVehicles(vs=>{
    const next=vs.map(x=>{
      if(x.id!==id)return x;
      const fixos=eixosFixosPerfil(x.id);
      return{...x,
        consumption:parseNumeroBR(editVehVals.consumption)||x.consumption,
        axles:fixos!=null?fixos:(parseInt(editVehVals.axles)||x.axles),
        kwh:parseNumeroBR(editVehVals.kwh)||x.kwh,
      };
    });
    writeVehiclesLocalCache(next);
    if(uid){
      void saveUserVehicles(uid,next).catch(()=>{/* offline: localStorage já salvo */});
    }
    return next;
  });setEditVeh(null);};

  const kmAutoInfo=mediaKmMesUltimos3Meses(historicoFretes,jornadas,hoje);
  const custoCalc=calcularCustoVeiculo({
    ...custoForm,
    kmMesAuto:kmAutoInfo.kmMes,
    kmMesAutoEstimado:kmAutoInfo.estimado,
    manutencoes:items,
  });
  const itensOrdenados=[...(custoCalc.itens||[])].sort((a,b)=>(b.valorKm||0)-(a.valorKm||0));
  const maxItemKm=Math.max(...itensOrdenados.map(i=>i.valorKm||0),0.001);
  const exemplo100=roundMoney((custoCalc.custoKm||0)*100);

  const setCustoCampo=(k,v)=>setCustoForm(f=>({...f,[k]:v}));

  const salvarCustoVeiculo=async()=>{
    setSalvandoCusto(true);
    setCustoMsg("");
    const resultado=calcularCustoVeiculo({
      ...custoForm,
      kmMesAuto:kmAutoInfo.kmMes,
      kmMesAutoEstimado:kmAutoInfo.estimado,
      manutencoes:items,
    });
    const cache=readCustoVeiculoLocalCache()||{};
    const payload=buildCustoVeiculoPersistPayload(custoForm,resultado,{
      odometro:odometroSalvo??cache.odometro,
      odometroAtualizadoEm:odometroAtualizadoEm||cache.odometroAtualizadoEm,
    });
    writeCustoVeiculoLocalCache(payload);
    try{
      if(uid)await saveUserCustoVeiculo(uid,payload);
      setCustoMsg("Custo salvo.");
      setTimeout(()=>setCustoMsg(""),2500);
    }catch{
      setCustoMsg("Salvo no aparelho (sem internet).");
      setTimeout(()=>setCustoMsg(""),3000);
    }finally{
      setSalvandoCusto(false);
    }
  };

  useEffect(()=>{
    if(!uid||isPago)return;
    (async()=>{
      setLimiteManut(!(await podeUsar(uid,"manutencao",FREE_LIMITS.manutencao)));
    })();
  },[uid,isPago]);

  useEffect(()=>{
    if(!uid){
      setCustoHydrated(true);
      return;
    }
    let cancelled=false;
    (async()=>{
      try{
        const profile=await loadUserProfile(uid);
        if(cancelled)return;
        const fromFs=extractCustoVeiculoFromProfile(profile);
        if(fromFs){
          setCustoForm(formFromCustoVeiculoPersist(fromFs));
          writeCustoVeiculoLocalCache(fromFs);
          const odoN=Number(fromFs.odometro);
          if(Number.isFinite(odoN)&&odoN>0){
            setOdometroSalvo(odoN);
            setOdometroAtualizadoEm(fromFs.odometroAtualizadoEm||null);
          }
        }
      }catch{
        /* mantém form do localStorage */
      }finally{
        if(!cancelled)setCustoHydrated(true);
      }
    })();
    return()=>{cancelled=true;};
  },[uid]);

  // Recalcula 1x com a regra nova e regrava se custoKm/camposAusentes mudaram
  useEffect(()=>{
    if(!custoHydrated||custoSyncDoneRef.current)return;
    const saved=readCustoVeiculoLocalCache();
    if(!hasCustoVeiculoPersistido(saved)){
      custoSyncDoneRef.current=true;
      return;
    }
    custoSyncDoneRef.current=true;
    const form=formFromCustoVeiculoPersist(saved);
    const kmAuto=mediaKmMesUltimos3Meses(historicoFretes,jornadas,new Date());
    const resultado=calcularCustoVeiculo({
      ...form,
      kmMesAuto:kmAuto.kmMes,
      kmMesAutoEstimado:kmAuto.estimado,
      manutencoes:items,
    });
    if(!custoPersistDiffers(saved,resultado))return;
    const payload=buildCustoVeiculoPersistPayload(form,resultado,{
      odometro:Number(saved.odometro)>0?saved.odometro:odometroSalvo,
      odometroAtualizadoEm:saved.odometroAtualizadoEm||odometroAtualizadoEm,
    });
    writeCustoVeiculoLocalCache(payload);
    setCustoForm(form);
    if(uid){
      void saveUserCustoVeiculo(uid,payload).catch(()=>{/* offline: cache já atualizado */});
    }
  },[custoHydrated,uid,items,historicoFretes,jornadas,odometroSalvo,odometroAtualizadoEm]);

  const abrirRegistrar=async()=>{
    if(!isPago&&uid){
      const{bloqueado}=await checarLimiteFree(uid,perfil,"manutencao");
      if(bloqueado){setLimiteManut(true);return;}
    }
    setShowAdd(true);
  };

  const odoInfo=resolveOdometroAtual({
    odometroSalvo,
    odometroAtualizadoEm,
    manutencoes:items,
  });
  const proximasManut=listarProximasManutencoes(items,odoInfo.km,hoje);

  const formatOdoData=(isoOrBr)=>{
    if(!isoOrBr)return "";
    if(String(isoOrBr).includes("T")){
      try{
        const d=new Date(isoOrBr);
        if(!Number.isNaN(d.getTime()))return d.toLocaleDateString("pt-BR");
      }catch{/* ignore */}
    }
    return String(isoOrBr);
  };

  const salvarOdometro=async()=>{
    const v=parseNumeroBR(draftOdo);
    if(!(v>0)){setEditandoOdo(false);return;}
    const agoraIso=new Date().toISOString();
    setSalvandoOdo(true);
    const prev=readCustoVeiculoLocalCache()||{};
    const payload=mergeCustoVeiculoOdometro(prev,v,agoraIso);
    writeCustoVeiculoLocalCache(payload);
    setOdometroSalvo(v);
    setOdometroAtualizadoEm(agoraIso);
    setEditandoOdo(false);
    try{
      if(uid)await saveUserCustoVeiculo(uid,payload);
    }catch{/* offline: cache local já salvo */}
    finally{setSalvandoOdo(false);}
  };

  const save=async()=>{
    const payload={...form,cost:parseNumeroBR(form.cost)||0};
    const wasEditing=!!editingId;
    setErroForm("");
    try{
      if(editingId){
        const orig=items.find(i=>i.id===editingId);
        await onUpdateManutencao?.({id:editingId,...payload,status:orig?.status||"ok"});
        setEditingId(null);
      } else {
        if(!isPago&&uid){
          const{bloqueado}=await checarLimiteFree(uid,perfil,"manutencao");
          if(bloqueado){setLimiteManut(true);closeModal();return;}
        }
        await onAddManutencao?.({...payload,status:"ok"});
        if(!isPago&&uid){
          void incrementarUso(uid,"manutencao");
          setLimiteManut(!(await podeUsar(uid,"manutencao",FREE_LIMITS.manutencao)));
        }
      }
      resetForm();
      setShowAdd(false);
    }catch{
      setErroForm(wasEditing
        ?"Não foi possível atualizar. Verifique sua conexão e tente novamente."
        :"Não foi possível salvar. Verifique sua conexão e tente novamente.");
    }
  };
  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><h1 style={{color:C.navy,fontSize:22,fontWeight:900,fontFamily:"'Sora',sans-serif",margin:0}}>Meu Veículo</h1><PrimaryBtn onClick={abrirRegistrar} small disabled={limiteManut&&!isPago}><PlusIcon size={12}/> Registrar</PrimaryBtn></div>

      {/* CONSUMO POR VEÍCULO */}
      <Card>
        <CardHeader title="🚛 Consumo por Veículo"/>
        <div style={{padding:"12px 18px 18px"}}>
          <div style={{background:C.greenLight,border:`1px solid ${C.green}33`,borderRadius:10,padding:"9px 12px",marginBottom:14,display:"flex",alignItems:"center",gap:7}}>
            <InfoIcon size={13} color={C.green}/>
            <span style={{color:C.green,fontSize:12}}>Edite o consumo de cada veículo. Só o caminhão permite alterar o número de eixos (pedágio).</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {(vehicles||[]).map(v=>(
              <div key={v.id} style={{background:C.subtle,borderRadius:12,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:editVeh===v.id?12:0}}>
                  <div style={{fontSize:26,flexShrink:0}}>{v.emoji}</div>
                  <div style={{flex:1}}>
                    <div style={{color:C.text,fontWeight:700,fontSize:14}}>{v.label}</div>
                    <div style={{color:C.muted,fontSize:12}}>
                      {v.id==="moto"
                        ?(v.electric?formatKwhPrice(v.kwh||1.85):formatConsumoKmL(v.consumption))
                        :`${plural(v.id==="caminhao"?v.axles:EIXOS_CATEGORIA_CARRO,"eixo","eixos")} · ${v.electric?formatKwhPrice(v.kwh||1.85):formatConsumoKmL(v.consumption)}`}
                    </div>
                  </div>
                  {editVeh===v.id
                    ?<button onClick={()=>saveVeh(v.id)} style={{background:C.greenLight,border:`1px solid ${C.green}33`,borderRadius:8,padding:"5px 10px",cursor:"pointer",color:C.green,fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:4,flexShrink:0}}><SaveIcon size={11}/> Salvar</button>
                    :<button onClick={()=>startEditVeh(v)} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"5px 9px",cursor:"pointer",color:C.orange,display:"flex",alignItems:"center",flexShrink:0}}><EditIcon size={13}/></button>}
                </div>
                {editVeh===v.id&&(
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {v.electric
                      ?<Field label="Preço por kWh (R$)" value={editVehVals.kwh||""} onChange={val=>setEditVehVals(e=>({...e,kwh:val}))} prefix="R$"/>
                      :<Field label="Consumo (km/L)" value={editVehVals.consumption||""} onChange={val=>setEditVehVals(e=>({...e,consumption:val}))} suffix="km/L"/>}
                    {v.id==="caminhao"
                      ?<Field label="Número de Eixos" value={editVehVals.axles||""} onChange={val=>setEditVehVals(e=>({...e,axles:val}))} suffix="eixos" hint="Define o multiplicador de pedágio do caminhão."/>
                      :v.id==="moto"
                        ?<div style={{background:C.navyLight,border:`1px solid ${C.navy}22`,borderRadius:9,padding:"8px 12px",color:C.navy,fontSize:12}}>Pedágio estimado pela categoria moto (Google).</div>
                        :<Field label="Número de Eixos" value={String(EIXOS_CATEGORIA_CARRO)} readOnly suffix="eixos" hint="Categoria fixa para pedágio (carro)."/>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ODÔMETRO ATUAL */}
      <Card>
        <CardHeader title="🛣️ Odômetro atual"/>
        <div style={{padding:"12px 18px 18px",display:"flex",flexDirection:"column",gap:12}}>
          {editandoOdo?(
            <div style={{display:"flex",alignItems:"flex-end",gap:10}}>
              <div style={{flex:1}}>
                <Field label="Km atuais" value={draftOdo} onChange={setDraftOdo} suffix="km"/>
              </div>
              <button type="button" onClick={()=>void salvarOdometro()} disabled={salvandoOdo}
                style={{background:C.navy,border:"none",borderRadius:10,padding:"11px 14px",cursor:salvandoOdo?"wait":"pointer",color:"#fff",fontWeight:800,fontSize:13,opacity:salvandoOdo?0.7:1,marginBottom:1}}>
                {salvandoOdo?"…":"Salvar"}
              </button>
              <button type="button" onClick={()=>setEditandoOdo(false)}
                style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 12px",cursor:"pointer",color:C.text2,fontWeight:700,fontSize:13,marginBottom:1}}>
                Cancelar
              </button>
            </div>
          ):(
            <>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <div>
                  {odoInfo.km!=null?(
                    <>
                      <div style={{color:C.navy,fontWeight:900,fontSize:30,fontFamily:"'Sora',sans-serif",lineHeight:1}}>{formatKm(odoInfo.km)} <span style={{fontSize:14,fontWeight:700,color:C.muted}}>km</span></div>
                      <div style={{color:C.muted,fontSize:12,marginTop:8}}>
                        {odoInfo.origem==="manual"
                          ?`Atualizado em ${formatOdoData(odoInfo.atualizadoEm)||"—"}`
                          :`do seu último registro${odoInfo.dataOrigem?` · ${odoInfo.dataOrigem}`:""}`}
                      </div>
                    </>
                 ):(
                    <>
                      <div style={{color:C.navy,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif"}}>Ainda sem odômetro</div>
                      <div style={{color:C.muted,fontSize:12,marginTop:6,lineHeight:1.45}}>Informe os km atuais para alertar as próximas manutenções.</div>
                    </>
                  )}
                </div>
                <button type="button" onClick={()=>{setDraftOdo(odoInfo.km!=null?String(Math.round(odoInfo.km)):"");setEditandoOdo(true);}}
                  style={{background:C.orangeLight,border:`1px solid ${C.orange}33`,borderRadius:11,padding:"9px 14px",cursor:"pointer",color:C.orange,fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <EditIcon size={13}/> {odoInfo.km!=null?"Atualizar":"Informar"}
                </button>
              </div>
            </>
          )}
        </div>
      </Card>

      {/* PRÓXIMAS MANUTENÇÕES */}
      {proximasManut.length>0&&(
        <Card>
          <CardHeader title="🔧 Próximas manutenções"/>
          <div style={{padding:"8px 18px 16px",display:"flex",flexDirection:"column",gap:10}}>
            {proximasManut.map((p)=>{
              const cor=p.status==="vencido"?C.red:p.status==="proximo"?C.amber:C.green;
              const bg=p.status==="vencido"?C.redLight:p.status==="proximo"?C.amberLight:C.greenLight;
              let sub="";
              let pctBar=100;
              if(p.modo==="km"){
                if(p.faltam<=0){
                  sub=`vencido há ${formatKm(Math.abs(p.faltam))} km`;
                  pctBar=100;
                }else{
                  sub=`faltam ${formatKm(p.faltam)} km · próxima em ${formatKm(p.nextKm)} km`;
                  // barra: quanto mais perto de 0, mais cheia (alerta)
                  const janela=2000;
                  pctBar=p.faltam>=janela?Math.max(8,100-((p.faltam-janela)/Math.max(p.nextKm,1))*40):Math.min(100,((janela-p.faltam)/janela)*100);
                  if(p.status==="ok")pctBar=Math.min(35,pctBar);
                }
              }else{
                const m=p.mesesDesdeUltima;
                if(m==null)sub="sem data no último registro";
                else if(m===0)sub="última este mês";
                else if(m===1)sub="última há 1 mês";
                else sub=`última há ${m} meses`;
                pctBar=m==null?20:Math.min(100,Math.round((m/12)*100));
              }
              return(
                <div key={p.type} style={{background:bg,border:`1px solid ${cor}33`,borderRadius:12,padding:"12px 14px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,marginBottom:8}}>
                    <div style={{color:cor,fontWeight:800,fontSize:14}}>{p.type}</div>
                    <div style={{color:cor,fontWeight:700,fontSize:12,textAlign:"right"}}>{sub}</div>
                  </div>
                  <div style={{background:"#ffffff88",borderRadius:20,height:8,overflow:"hidden"}}>
                    <div style={{width:`${Math.max(6,Math.min(100,pctBar))}%`,height:"100%",background:cor,borderRadius:20,transition:"width .3s"}}/>
                  </div>
                </div>
              );
            })}
            {odoInfo.km==null&&(
              <div style={{color:C.muted,fontSize:11,lineHeight:1.45,padding:"0 2px"}}>
                Sem odômetro atual — alertas por tempo desde o último registro. Informe o odômetro para ver quanto falta em km.
              </div>
            )}
          </div>
        </Card>
      )}

      {/* CUSTO DE TER O VEÍCULO */}
      <Card>
        <CardHeader title="💰 Custo de ter o veículo"/>
        <div style={{padding:"12px 18px 18px",display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,borderRadius:14,padding:"18px 16px",boxShadow:`0 4px 16px ${C.navy}33`}}>
            <div style={{color:"#BFDBFE",fontSize:12,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase",marginBottom:6}}>Custo de ter o veículo</div>
            <div style={{color:"#fff",fontWeight:900,fontSize:32,fontFamily:"'Sora',sans-serif",lineHeight:1}}>{formatMoedaKm(custoCalc.custoKm)}</div>
            <div style={{color:"#E0F2FE",fontSize:12,marginTop:10,lineHeight:1.45}}>
              Num frete de 100 km, são <strong style={{fontWeight:800}}>{formatMoeda(exemplo100)}</strong> que hoje não aparecem na conta.
            </div>
            <div style={{marginTop:10,display:"inline-flex",background:"#ffffff22",borderRadius:20,padding:"4px 10px",color:"#fff",fontSize:11,fontWeight:700}}>
              {custoCalc.qtdPreenchidos} de {custoCalc.qtdTotal} preenchidos
            </div>
          </div>

          <button type="button" onClick={()=>setCustoAberto(a=>!a)}
            style={{width:"100%",background:"#F0F4FF",border:`1.5px solid ${C.navy}44`,borderRadius:12,padding:"13px 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",color:C.navy,fontWeight:800,fontSize:14,boxShadow:"0 1px 3px #1E3A8A12"}}>
            <span>{custoAberto?"Ocultar campos":"Mostrar campos"}</span>
            <span style={{color:C.navy,fontSize:22,lineHeight:1,fontWeight:700}}>{custoAberto?"▴":"▾"}</span>
          </button>

          {custoAberto&&(
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{background:C.navyLight,border:`1px solid ${C.navy}22`,borderRadius:12,padding:"12px 14px"}}>
                <div style={{color:C.navy,fontWeight:800,fontSize:13,marginBottom:8}}>Quanto você roda</div>
                <div style={{color:C.text2,fontSize:12,marginBottom:10,lineHeight:1.45}}>
                  {kmAutoInfo.fonte==="auto"
                    ?`${formatKm(kmAutoInfo.kmMes)} km/mês · média do que você registrou nos últimos 3 meses`
                    :`≈ ${formatKm(CUSTO_VEICULO_PADROES.kmMes)} km/mês · estimativa — você ainda tem poucas viagens registradas. Se roda mais que isso, ajuste abaixo.`}
                </div>
                <Field label="Ajustar km/mês (opcional)" value={custoForm.kmMesManual??""} onChange={v=>setCustoCampo("kmMesManual",v)} suffix="km" hint="Se preencher, este valor manda no cálculo."/>
              </div>

              <div style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
                <div style={{color:C.navy,fontWeight:800,fontSize:13}}>Por tempo (por ano)</div>
                <Field label="IPVA + licenciamento (R$/ano)" value={custoForm.ipvaAno} onChange={v=>setCustoCampo("ipvaAno",v)} prefix="R$"/>
                <Field label="Seguro (R$/ano)" value={custoForm.seguroAno} onChange={v=>setCustoCampo("seguroAno",v)} prefix="R$"/>
              </div>

              <div style={{background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 14px",display:"flex",flexDirection:"column",gap:10}}>
                <div style={{color:C.navy,fontWeight:800,fontSize:13}}>Por quilometragem</div>
                <Field label="Jogo de pneus (R$)" value={custoForm.pneuValor} onChange={v=>setCustoCampo("pneuValor",v)} prefix="R$"/>
                <Field label="Pneus duram quantos km" value={custoForm.pneuVidaKm} onChange={v=>setCustoCampo("pneuVidaKm",v)} suffix="km"/>
                <Field label="Troca de óleo (R$)" value={custoForm.oleoValor} onChange={v=>setCustoCampo("oleoValor",v)} prefix="R$"/>
                <Field label="Óleo a cada (km)" value={custoForm.oleoIntervaloKm} onChange={v=>setCustoCampo("oleoIntervaloKm",v)} suffix="km"/>
                <Field label="Revisão (R$)" value={custoForm.revisaoValor} onChange={v=>setCustoCampo("revisaoValor",v)} prefix="R$" hint="Se você já lança suas revisões na aba Manutenção, deixe este campo vazio para não contar duas vezes."/>
                <Field label="Revisão a cada (km)" value={custoForm.revisaoIntervaloKm} onChange={v=>setCustoCampo("revisaoIntervaloKm",v)} suffix="km"/>
              </div>

              <div style={{background:C.amberLight,border:`1px solid ${C.amber}44`,borderRadius:12,padding:"11px 14px",color:C.text2,fontSize:12,lineHeight:1.45}}>
                <strong style={{color:"#B45309"}}>Manutenção</strong>
                {" — "}
                {custoCalc.itens.find(i=>i.chave==="manutencao")?.ausente
                  ?`Sem registros nos últimos 12 meses · não incluído no cálculo`
                  :`${formatMoeda(custoCalc.manutencaoTotal12m)} em 12 meses · dos seus registros`}
              </div>
            </div>
          )}

          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{color:C.navy,fontWeight:800,fontSize:13}}>Detalhamento</div>
            {itensOrdenados.map(it=>{
              const pct=it.ausente?0:Math.min(100,((it.valorKm||0)/maxItemKm)*100);
              return(
                <div key={it.chave} style={{background:C.subtle,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.border}`,opacity:it.ausente?0.75:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,gap:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      <span style={{color:C.text,fontWeight:700,fontSize:13}}>{it.label}</span>
                      {it.ausente
                        ?<span style={{background:C.subtle,color:C.muted,fontSize:10,fontWeight:700,borderRadius:8,padding:"2px 7px",border:`1px solid ${C.border}`}}>Não incluído</span>
                        :it.chave==="manutencao"
                          ?<span style={{background:C.greenLight,color:C.green,fontSize:10,fontWeight:700,borderRadius:8,padding:"2px 7px"}}>dos registros</span>
                          :null}
                    </div>
                    <span style={{color:it.ausente?C.muted:C.navy,fontWeight:800,fontSize:13,whiteSpace:"nowrap"}}>
                      {it.ausente?"—":formatMoedaKm(it.valorKm)}
                    </span>
                  </div>
                  <div style={{background:"#E2E8F0",borderRadius:99,height:6,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:C.navy,borderRadius:99}}/>
                  </div>
                </div>
              );
            })}
          </div>

          <PrimaryBtn onClick={salvarCustoVeiculo} disabled={salvandoCusto} style={{width:"100%"}}>
            {salvandoCusto?"Salvando…":"Salvar custo do veículo"}
          </PrimaryBtn>
          {custoMsg&&<div style={{textAlign:"center",color:C.green,fontSize:12,fontWeight:600}}>{custoMsg}</div>}
        </div>
      </Card>

      {limiteManut&&!isPago&&(
        <LimiteAtingido mensagem={MSG_LIMITE.manutencao}/>
      )}
      <MonthNav mes={mesSel} ano={anoSel} onPrev={prevMes} onNext={nextMes}/>
      {itemsMes.length>0&&(
        <div style={{background:"linear-gradient(135deg,#FFFBEB,#FEF3C7)",border:`1px solid ${C.amber}44`,borderRadius:14,padding:"14px 18px",boxShadow:"0 2px 8px #F59E0B18"}}>
          <div style={{color:"#B45309",fontSize:12,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase",marginBottom:4,opacity:0.9}}>Total de Manutenções · {MESES_PT[mesSel]}</div>
          <div style={{color:"#92400E",fontWeight:800,fontSize:24,fontFamily:"'Sora',sans-serif",lineHeight:1}}>{formatMoeda(totalManut)}</div>
          <div style={{color:"#B45309",fontSize:11,marginTop:4,opacity:0.8}}>{pluralRegistros(itemsMes.length)}</div>
        </div>
      )}
      {alerts>0&&<div style={{background:C.amberLight,border:`1px solid ${C.amber}44`,borderRadius:12,padding:"11px 15px",display:"flex",gap:9,alignItems:"center"}}><AlertTriangleIcon size={16} color={C.amber}/><div><div style={{color:C.amber,fontWeight:700,fontSize:14}}>{plural(alerts,"manutenção","manutenções")} com atenção</div></div></div>}
      <Card>{itemsMes.length===0?(
        <div style={{padding:"36px 20px",textAlign:"center"}}>
          <div style={{fontSize:44,marginBottom:12}}>🔧</div>
          <div style={{color:C.navy,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif",marginBottom:6}}>Nenhuma manutenção em {MESES_PT[mesSel]}</div>
          <div style={{color:C.muted,fontSize:14,lineHeight:1.6,marginBottom:14}}>Registre trocas de óleo, pneus e revisões para nunca perder um prazo importante.</div>
          <button onClick={()=>abrirRegistrar()} style={{background:C.amber,border:"none",borderRadius:12,padding:"10px 20px",cursor:limiteManut&&!isPago?"not-allowed":"pointer",color:"#fff",fontWeight:700,fontSize:14,opacity:limiteManut&&!isPago?0.5:1}}>
            🔧 Registrar primeira manutenção
          </button>
        </div>
      ):itemsMes.map((item,i)=>(
        <div key={item.id} style={{padding:"14px 20px",borderBottom:i<itemsMes.length-1?`1px solid ${C.border}`:"none",display:"flex",alignItems:"center",gap:11}}>
          <div style={{width:38,height:38,borderRadius:10,background:C.amberLight,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><WrenchIcon size={16} color={C.amber}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{color:C.navy,fontWeight:700,fontSize:14}}>{item.type}</div>
            {maintMetaParts(item).length>0&&<div style={{color:C.muted,fontSize:12,marginTop:2}}>{maintMetaParts(item).join(" · ")}</div>}
            {item.nextKm!=null&&String(item.nextKm).trim()!==""&&<div style={{color:C.muted,fontSize:11}}>Próxima em {formatKm(item.nextKm)} km</div>}
          </div>
          <div style={{color:C.red,fontWeight:700,fontSize:14,flexShrink:0,whiteSpace:"nowrap"}}>- {formatMoeda(item.cost||0)}</div>
          <button onClick={()=>openEdit(item)} style={{background:C.orangeLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.orange,display:"flex",flexShrink:0}}><EditIcon size={13}/></button>
          <button onClick={()=>setDel(item)} style={{background:C.redLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.red,display:"flex",flexShrink:0}}><Trash2Icon size={13}/></button>
        </div>
      ))}
      </Card>
      {showAdd&&(<ModalWrap><ModalHeader title={editingId?"Editar Manutenção":"Nova Manutenção"} icon={WrenchIcon} iconColor={C.amber} onClose={closeModal}/>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><label style={{color:C.text2,fontSize:14,fontWeight:700,letterSpacing:0.4}}>Tipo de Serviço</label><button onClick={()=>setShowManage(true)} style={{background:"none",border:"none",cursor:"pointer",color:C.orange,fontSize:14,fontWeight:700,display:"flex",alignItems:"center",gap:3}}><EditIcon size={11}/> Gerenciar tipos</button></div>
            <div style={{display:"flex",alignItems:"center",background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:10,overflow:"hidden"}}>
              <input value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))} placeholder="Digite ou selecione abaixo"
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,padding:"10px 12px",fontSize:14}}
                onFocus={e=>e.target.parentElement.style.borderColor=C.orange} onBlur={e=>e.target.parentElement.style.borderColor=C.border}/>
              {form.type&&<button onClick={()=>setForm(f=>({...f,type:""}))} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,padding:"0 10px",display:"flex"}}><XIcon size={14}/></button>}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:4}}>
              {stypes.map((t,i)=>(
                <button key={i} onClick={()=>setForm(f=>({...f,type:t}))}
                  style={{background:form.type===t?C.orangeLight:C.subtle,border:`1.5px solid ${form.type===t?C.orange:C.border}`,borderRadius:20,padding:"5px 12px",cursor:"pointer",color:form.type===t?C.orange:C.text2,fontSize:12,fontWeight:form.type===t?700:500}}>
                  {t}
                </button>
              ))}
            </div>
          </div>
          <Field label="Veículo" value={form.vehicle} onChange={v=>setForm(f=>({...f,vehicle:v}))} placeholder="Caminhão MB 1620"/>
          <DatePicker label="Data do Serviço" value={form.date} onChange={v=>setForm(f=>({...f,date:v}))}/>
          <Field label="KM Atual" value={form.km} onChange={v=>setForm(f=>({...f,km:v}))} suffix="km"/>
          <Field label="Próxima Revisão (KM)" value={form.nextKm} onChange={v=>setForm(f=>({...f,nextKm:v}))} suffix="km"/>
          <Field label="Custo (R$)" value={form.cost} onChange={v=>setForm(f=>({...f,cost:v}))} prefix="R$"/>
        </div>
        {erroForm&&<div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",color:"#DC2626",fontSize:13,fontWeight:600,marginTop:12}}>⚠️ {erroForm}</div>}
        <PrimaryBtn onClick={save} style={{width:"100%",marginTop:16}}>{editingId?"Salvar alterações →":"Salvar →"}</PrimaryBtn>
      </ModalWrap>)}
      {showManage&&(<ModalWrap><ModalHeader title="Tipos de Serviço" icon={WrenchIcon} iconColor={C.amber} onClose={()=>setShowManage(false)}/>
        <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
          {stypes.map((t,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:C.subtle,borderRadius:10,padding:"9px 12px",border:`1px solid ${C.border}`}}>
              {editTIdx===i
                ?<input value={editTVal} onChange={e=>setEditTVal(e.target.value)} style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14}} onFocus={e=>e.target.parentElement.style.border=`1.5px solid ${C.orange}`} onBlur={e=>e.target.parentElement.style.border=`1px solid ${C.border}`}/>
                :<span style={{flex:1,color:C.text,fontSize:14}}>{t}</span>}
              <div style={{display:"flex",gap:6}}>
                {editTIdx===i
                  ?<button onClick={()=>{if(!editTVal.trim())return;setStypes(ts=>ts.map((x,j)=>j===i?editTVal.trim():x));setEditTIdx(null);}} style={{background:C.greenLight,border:"none",borderRadius:7,padding:"4px 9px",cursor:"pointer",color:C.green,fontWeight:700,fontSize:12}}>✓</button>
                  :<button onClick={()=>{setEditTIdx(i);setEditTVal(t);}} style={{background:C.orangeLight,border:"none",borderRadius:7,padding:"4px 7px",cursor:"pointer",color:C.orange,display:"flex"}}><EditIcon size={12}/></button>}
                <button onClick={()=>setStypes(ts=>ts.filter((_,j)=>j!==i))} style={{background:C.redLight,border:"none",borderRadius:7,padding:"4px 7px",cursor:"pointer",color:C.red,display:"flex"}}><Trash2Icon size={12}/></button>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={newType} onChange={e=>setNewType(e.target.value)} placeholder="Novo tipo de serviço..." onKeyDown={e=>{if(e.key==="Enter"&&newType.trim()){setStypes(t=>[...t,newType.trim()]);setNewType("");}}}
            style={{flex:1,background:C.subtle,border:`1.5px solid ${C.border}`,borderRadius:10,outline:"none",color:C.text,padding:"10px 12px",fontSize:14}}
            onFocus={e=>e.target.style.borderColor=C.orange} onBlur={e=>e.target.style.borderColor=C.border}/>
          <PrimaryBtn onClick={()=>{if(!newType.trim())return;setStypes(t=>[...t,newType.trim()]);setNewType("");}} small><PlusIcon size={13}/> Adicionar</PrimaryBtn>
        </div>
      </ModalWrap>)}
      {del&&<DeleteConfirm message={`Excluir "${del.type}" do ${del.vehicle}?`} error={erroDel} onConfirm={async()=>{setErroDel("");try{await onDeleteManutencao?.(del.id);setDel(null);}catch{setErroDel("Não foi possível excluir. Verifique sua conexão e tente novamente.");}}} onCancel={()=>{setDel(null);setErroDel("");}}/>}
    </div>
  );
};

// ── DOCUMENTOS ────────────────────────────────────────────────────────────────
const calcDiasRestantes=(expiry)=>{
  if(!expiry)return null;
  const[d,m,y]=expiry.split("/");
  const exp=new Date(y,m-1,d);
  const hoje=new Date();hoje.setHours(0,0,0,0);
  return Math.ceil((exp-hoje)/(1000*60*60*24));
};

const getDocStatus=(dias)=>{
  if(dias===null)return{color:C.muted,bg:C.subtle,label:"—",icon:"📄"};
  if(dias<0)return{color:C.red,bg:C.redLight,label:`Vencido há ${pluralDias(Math.abs(dias))}`,icon:"❌"};
  if(dias<=30)return{color:C.red,bg:C.redLight,label:`Vence em ${pluralDias(dias)} ⚠️`,icon:"🚨"};
  if(dias<=60)return{color:C.amber,bg:C.amberLight,label:`Vence em ${pluralDias(dias)}`,icon:"⚠️"};
  return{color:C.green,bg:C.greenLight,label:`Válido · ${dias} dias`,icon:"✅"};
};

const Documentos=({docs,onAddDocumento,onDeleteDocumento,uid,perfil})=>{
  const isPago=getPlanoAtual(perfil).isPago;
  const[limiteDocs,setLimiteDocs]=useState(false);
  const[showAdd,setShowAdd]=useState(false);
  const[del,setDel]=useState(null);
  const[erroForm,setErroForm]=useState("");
  const[erroDel,setErroDel]=useState("");
  const[form,setForm]=useState({type:"CNH",vehicle:"",number:"",expiry:""});

  useEffect(()=>{
    if(!uid||isPago)return;
    (async()=>{
      setLimiteDocs(!(await podeUsar(uid,"documentos",FREE_LIMITS.documentos)));
    })();
  },[uid,isPago]);

  const abrirAdicionar=async()=>{
    if(!isPago&&uid){
      const{bloqueado}=await checarLimiteFree(uid,perfil,"documentos");
      if(bloqueado){setLimiteDocs(true);return;}
    }
    setShowAdd(true);
  };

  const salvarDocumento=async()=>{
    if(!isPago&&uid){
      const{bloqueado}=await checarLimiteFree(uid,perfil,"documentos");
      if(bloqueado){setLimiteDocs(true);setShowAdd(false);return;}
    }
    setErroForm("");
    try{
      await onAddDocumento?.({...form,status:"ok"});
      if(!isPago&&uid){
        void incrementarUso(uid,"documentos");
        setLimiteDocs(!(await podeUsar(uid,"documentos",FREE_LIMITS.documentos)));
      }
      setForm({type:"CNH",vehicle:"",number:"",expiry:""});
      setShowAdd(false);
    }catch{
      setErroForm("Não foi possível salvar. Verifique sua conexão e tente novamente.");
    }
  };

  const docsComStatus=docs.map(doc=>{
    const dias=calcDiasRestantes(doc.expiry);
    const st=getDocStatus(dias);
    return{...doc,dias,st};
  });
  const alertasVermelhos=docsComStatus.filter(d=>d.dias!==null&&d.dias<=30).length;
  const alertasAmarelos=docsComStatus.filter(d=>d.dias!==null&&d.dias>30&&d.dias<=60).length;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h1 style={{color:C.navy,fontSize:22,fontWeight:900,fontFamily:"'Sora',sans-serif",margin:0}}>Documentos</h1>
        <PrimaryBtn onClick={abrirAdicionar} small disabled={limiteDocs&&!isPago}><PlusIcon size={12}/> Adicionar</PrimaryBtn>
      </div>

      {limiteDocs&&!isPago&&(
        <LimiteAtingido mensagem={MSG_LIMITE.documentos}/>
      )}

      {alertasVermelhos>0&&(
        <div style={{background:C.redLight,border:`1px solid ${C.red}44`,borderRadius:12,padding:"12px 16px",display:"flex",gap:9,alignItems:"center"}}>
          <span style={{fontSize:20}}>🚨</span>
          <div><div style={{color:C.red,fontWeight:700,fontSize:14}}>{pluralDocumentosVence(alertasVermelhos,30)}</div><div style={{color:C.red,fontSize:12,opacity:0.8}}>Renove com urgência para evitar multas</div></div>
        </div>
      )}
      {alertasAmarelos>0&&(
        <div style={{background:C.amberLight,border:`1px solid ${C.amber}44`,borderRadius:12,padding:"12px 16px",display:"flex",gap:9,alignItems:"center"}}>
          <span style={{fontSize:20}}>⚠️</span>
          <div><div style={{color:C.amber,fontWeight:700,fontSize:14}}>{pluralDocumentosVence(alertasAmarelos,60)}</div><div style={{color:C.amber,fontSize:12,opacity:0.8}}>Fique atento e planeje a renovação</div></div>
        </div>
      )}

      <Card>
        {docsComStatus.length===0?(
          <div style={{padding:"40px 20px",textAlign:"center"}}>
            <div style={{fontSize:52,marginBottom:14}}>📄</div>
            <div style={{color:C.navy,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif",marginBottom:8}}>Nenhum documento cadastrado</div>
            <div style={{color:C.muted,fontSize:14,lineHeight:1.6,marginBottom:18}}>Cadastre seus documentos como CNH, CRLV e Seguro para receber alertas antes do vencimento e nunca ser pego de surpresa.</div>
            <div style={{display:"flex",flexDirection:"column",gap:8,maxWidth:260,margin:"0 auto"}}>
              {[
                {emoji:"🚨",txt:"Alerta vermelho — vence em até 30 dias"},
                {emoji:"⚠️",txt:"Alerta amarelo — vence em até 60 dias"},
                {emoji:"✅",txt:"Verde — documento válido e em dia"},
              ].map((a,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,background:C.subtle,borderRadius:10,padding:"8px 12px",textAlign:"left"}}>
                  <span style={{fontSize:16}}>{a.emoji}</span>
                  <span style={{color:C.text2,fontSize:12}}>{a.txt}</span>
                </div>
              ))}
            </div>
          </div>
        ):docsComStatus.map((doc,i)=>(
          <div key={doc.id} style={{padding:"14px 20px",borderBottom:i<docsComStatus.length-1?`1px solid ${C.border}`:"none",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:11}}>
              <div style={{width:42,height:42,borderRadius:12,background:doc.st.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>
                {doc.st.icon}
              </div>
              <div>
                <div style={{color:C.navy,fontWeight:700,fontSize:14}}>{doc.type}</div>
                <div style={{color:C.muted,fontSize:12,marginTop:2}}>{doc.vehicle} · Nº {doc.number}</div>
                <div style={{color:doc.st.color,fontSize:12,fontWeight:600,marginTop:3}}>{doc.expiry} · {doc.st.label}</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:9}}>
              <div style={{background:doc.st.bg,borderRadius:20,padding:"4px 10px"}}>
                <span style={{color:doc.st.color,fontSize:14,fontWeight:700}}>{doc.dias!==null?(doc.dias<0?"Vencido":`${doc.dias}d`):"—"}</span>
              </div>
              <button onClick={()=>setDel(doc)} style={{background:C.redLight,border:"none",borderRadius:8,padding:6,cursor:"pointer",color:C.red,display:"flex"}}><Trash2Icon size={14}/></button>
            </div>
          </div>
        ))}
      </Card>

      {showAdd&&(<ModalWrap><ModalHeader title="Novo Documento" icon={FileTextIcon} iconColor={C.navy} onClose={()=>{setShowAdd(false);setErroForm("");}}/>
        <ModalFormLayout footer={<PrimaryBtn onClick={salvarDocumento} style={{width:"100%"}}>Salvar →</PrimaryBtn>}>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <SelectField label="Tipo" value={form.type} onChange={v=>setForm(f=>({...f,type:v}))} options={["CNH","CRLV","Seguro","Tacógrafo","Licença ANTT","Outros"]}/>
            {form.type!=="CNH"&&<Field label="Veículo / Titular" value={form.vehicle} onChange={v=>setForm(f=>({...f,vehicle:v}))} placeholder="Caminhão MB 1620"/>}
            <Field label="Número / Registro" value={form.number} onChange={v=>setForm(f=>({...f,number:v}))} placeholder="ABC-1234"/>
            <DatePicker fullScreen label="Data de Vencimento" value={form.expiry} onChange={v=>setForm(f=>({...f,expiry:v}))}/>
            {erroForm&&<div style={{background:"#FFF5F5",border:"1.5px solid #FCA5A5",borderRadius:10,padding:"10px 13px",color:"#DC2626",fontSize:13,fontWeight:600}}>⚠️ {erroForm}</div>}
          </div>
        </ModalFormLayout>
      </ModalWrap>)}
      {del&&<DeleteConfirm message={`Excluir "${del.type}" de ${del.vehicle}?`} error={erroDel} onConfirm={async()=>{setErroDel("");try{await onDeleteDocumento?.(del.id);setDel(null);}catch{setErroDel("Não foi possível excluir. Verifique sua conexão e tente novamente.");}}} onCancel={()=>{setDel(null);setErroDel("");}}/>}
    </div>
  );
};

// ── FINANCEIRO ────────────────────────────────────────────────────────────────
const MESES_PT=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
// V293 — emoji por serviço de app (Fechamento do dia)
const servicoEmoji=(s="")=>{
  const k=s.toLowerCase();
  if(k.includes("uber"))return"🚗";
  if(k.includes("99"))return"🚕";
  if(k.includes("ifood"))return"🍔";
  if(k.includes("mercado"))return"📦";
  if(k.includes("rappi"))return"🛵";
  if(k.includes("loggi"))return"📮";
  return"💼";
};

// V304 — saldo líquido mensal compartilhado (Financeiro + Perfil)
const normalizarJornadasDate=(jornadas)=>(jornadas||[]).map(j=>({...j,date:j.data||j.date||""}));

const calcSaldoMes=(historicoFretes,manutencoes,despesas,jornadas,m,a)=>{
  const jornadasN=normalizarJornadasDate(jornadas);
  const despesasBase=(despesas||[]).filter(d=>!d.jornadaId);
  const fM=filtrarPorMesData(historicoFretes,m,a);
  const mM=filtrarPorMesData(manutencoes,m,a);
  const dM=filtrarPorMesData(despesasBase,m,a);
  const jM=filtrarPorMesData(jornadasN,m,a);
  const receita=roundMoney(fM.reduce((s,f)=>s+(f.freteSugerido||0),0)+jM.reduce((s,j)=>s+(j.valorRecebido||0),0));
  const custo=roundMoney(fM.reduce((s,f)=>s+(f.custoTotal||0),0)+jM.reduce((s,j)=>s+(j.custoTotal||0),0));
  const maint=roundMoney(mM.reduce((s,mn)=>s+(mn.cost||0),0));
  const desp=roundMoney(dM.reduce((s,d)=>s+(d.valor||0),0));
  return roundMoney(receita-custo-maint-desp);
};

const Financeiro=({historicoFretes,manutencoes,despesas=[],jornadas=[],uid,metaMes,setMetaMes})=>{
  const hoje=new Date();
  // V291 — jornadas (Fechamento do dia) usam campo `data`; normaliza p/ reusar filtros por `date`.
  const jornadasN=normalizarJornadasDate(jornadas);
  // V293 — despesas vinculadas a jornada (jornadaId) não entram mais em "Despesas":
  // o custo da jornada passa a ser contado em "Custo das viagens".
  const despesasBase=(despesas||[]).filter(d=>!d.jornadaId);
  const[mesSel,setMesSel]=useState(hoje.getMonth());
  const[anoSel,setAnoSel]=useState(hoje.getFullYear());
  const[periodoGraf,setPeriodoGraf]=useState("6");
  const[dataIni,setDataIni]=useState("");
  const[dataFim,setDataFim]=useState("");
  const[editandoMeta,setEditandoMeta]=useState(false);
  const[draftMeta,setDraftMeta]=useState(()=>formatMoedaParaCampo(metaMes));
  const[salvandoMeta,setSalvandoMeta]=useState(false);

  const prevMes=()=>{if(mesSel===0){setMesSel(11);setAnoSel(a=>a-1);}else setMesSel(m=>m-1);};
  const nextMes=()=>{if(mesSel===11){setMesSel(0);setAnoSel(a=>a+1);}else setMesSel(m=>m+1);};

  // Filtrar fretes do mês selecionado
  const fretesMes=filtrarPorMesData(historicoFretes,mesSel,anoSel);

  // Filtrar manutenções do mês
  const maintMes=filtrarPorMesData(manutencoes,mesSel,anoSel);

  // Filtrar despesas do mês (sem as despesas vinculadas a jornada)
  const despMes=filtrarPorMesData(despesasBase,mesSel,anoSel);

  // Filtrar jornadas do mês (Fechamento do dia)
  const jornadasMes=filtrarPorMesData(jornadasN,mesSel,anoSel);
  const totalJornadaReceita=roundMoney(jornadasMes.reduce((a,j)=>a+(j.valorRecebido||0),0));
  const totalJornadaCusto=roundMoney(jornadasMes.reduce((a,j)=>a+(j.custoTotal||0),0));
  const totalJornadaKm=jornadasMes.reduce((a,j)=>a+(j.km||0),0);

  // V293 — agrupa as jornadas do mês por serviço (Uber/99/iFood…) p/ identificar a origem do ganho
  const jornadasPorServico=(()=>{
    const map={};
    jornadasMes.forEach(j=>{
      const s=(j.servico||"Outro").trim()||"Outro";
      if(!map[s])map[s]={servico:s,receita:0,custo:0,km:0,qtd:0};
      map[s].receita+=j.valorRecebido||0;
      map[s].custo+=j.custoTotal||0;
      map[s].km+=j.km||0;
      map[s].qtd+=1;
    });
    return Object.values(map)
      .map(g=>({...g,receita:roundMoney(g.receita),custo:roundMoney(g.custo),liquido:roundMoney(g.receita-g.custo)}))
      .sort((a,b)=>b.receita-a.receita);
  })();

  // V300 — agrupa fretes + jornadas por fonte (Frete + apps) p/ o card de ganhos
  const ganhosPorFonte=(()=>{
    const items=[];
    if(fretesMes.length>0){
      const receita=roundMoney(fretesMes.reduce((a,f)=>a+(f.freteSugerido||0),0));
      const custo=roundMoney(fretesMes.reduce((a,f)=>a+(f.custoTotal||0),0));
      const km=fretesMes.reduce((a,f)=>a+(f.distance||0),0);
      items.push({servico:"Frete",emoji:"🚚",receita,custo,km,qtd:fretesMes.length,liquido:roundMoney(receita-custo),tipo:"frete"});
    }
    jornadasPorServico.forEach(g=>{
      items.push({...g,emoji:servicoEmoji(g.servico),tipo:"app"});
    });
    return items.sort((a,b)=>b.receita-a.receita);
  })();

  // Cálculos reais (componentes já arredondados no save)
  // Receita = fretes + jornadas · Custo das viagens = custo dos fretes + custo das jornadas
  const totalReceita=roundMoney(fretesMes.reduce((a,f)=>a+(f.freteSugerido||0),0)+totalJornadaReceita);
  const totalCusto=roundMoney(fretesMes.reduce((a,f)=>a+(f.custoTotal||0),0)+totalJornadaCusto);
  const totalKm=fretesMes.reduce((a,f)=>a+(f.distance||0),0)+totalJornadaKm;
  const totalMaint=roundMoney(maintMes.reduce((a,m)=>a+(m.cost||0),0));
  const totalDesp=roundMoney(despMes.reduce((a,d)=>a+(d.valor||0),0));
  const saldoLiquido=roundMoney(totalReceita-totalCusto-totalMaint-totalDesp);
  const receitaKm=totalKm>0?roundMoney(totalReceita/totalKm):0;
  const lucroKm=totalKm>0?roundMoney(saldoLiquido/totalKm):0;
  const margemPct=totalReceita>0?roundMoney((saldoLiquido/totalReceita)*100):null;

  const pctMeta=metaMes>0?Math.min((totalReceita/metaMes)*100,100):0;
  const faltaMeta=metaMes>0?Math.max(metaMes-totalReceita,0):0;
  const atingiuMeta=totalReceita>=metaMes&&metaMes>0;
  const salvarMeta=async()=>{
    const v=parseNumeroBR(draftMeta);
    if(!(v>0)){setEditandoMeta(false);return;}
    setMetaMes?.(v);
    writeMetaMesLocalCache(v);
    setEditandoMeta(false);
    if(!uid)return;
    setSalvandoMeta(true);
    try{await saveUserMetaMes(uid,v);}catch{/* offline: cache local já salvo */}
    finally{setSalvandoMeta(false);}
  };

  const prevMesIdx=mesSel===0?11:mesSel-1;
  const prevAno=mesSel===0?anoSel-1:anoSel;
  const hasPrevData=[historicoFretes,manutencoes||[],despesasBase,jornadasN].some(arr=>filtrarPorMesData(arr,prevMesIdx,prevAno).length>0);
  const saldoMesAnterior=calcSaldoMes(historicoFretes,manutencoes,despesas,jornadas,prevMesIdx,prevAno);
  const diffSaldo=roundMoney(saldoLiquido-saldoMesAnterior);

  // Gráfico — período escolhido pelo usuário
  const getMesesGrafico=()=>{
    if(periodoGraf==="custom"&&dataIni&&dataFim){
      const[mI,yI]=dataIni.split("/");
      const[mF,yF]=dataFim.split("/");
      if(!yI||!mI||!yF||!mF)return[];
      const inicio=new Date(parseInt(yI),parseInt(mI)-1,1);
      const fim=new Date(parseInt(yF),parseInt(mF)-1,1);
      if(inicio>fim)return[];
      const meses=[];let cur=new Date(inicio);
      while(cur<=fim&&meses.length<=24){
        meses.push({mes:cur.getMonth(),ano:cur.getFullYear()});
        cur=new Date(cur.getFullYear(),cur.getMonth()+1,1);
      }
      return meses;
    }
    const n=periodoGraf==="3"?3:periodoGraf==="12"?12:6;
    return Array.from({length:n}).map((_,i)=>{
      const d=new Date(anoSel,mesSel-(n-1)+i,1);
      return{mes:d.getMonth(),ano:d.getFullYear()};
    });
  };

  const mesesGrafico=getMesesGrafico().map(({mes:m,ano:y})=>{
    const fM=historicoFretes.filter(f=>{if(!f.date)return false;const p=f.date.split("/");return p.length===3&&parseInt(p[1])-1===m&&parseInt(p[2])===y;});
    const mM=(manutencoes||[]).filter(mn=>{if(!mn.date)return false;const p=mn.date.split("/");return p.length===3&&parseInt(p[1])-1===m&&parseInt(p[2])===y;});
    const dM=despesasBase.filter(dep=>{if(!dep.date)return false;const p=dep.date.split("/");return p.length===3&&parseInt(p[1])-1===m&&parseInt(p[2])===y;});
    const jMg=jornadasN.filter(jj=>{if(!jj.date)return false;const p=jj.date.split("/");return p.length===3&&parseInt(p[1])-1===m&&parseInt(p[2])===y;});
    const lucro=fM.reduce((a,f)=>a+(f.lucro||0),0)+jMg.reduce((a,j)=>a+((j.valorRecebido||0)-(j.custoTotal||0)),0)-mM.reduce((a,mn)=>a+(mn.cost||0),0)-dM.reduce((a,d)=>a+(d.valor||0),0);
    return{label:MESES_PT[m].slice(0,3),lucro,mes:m,ano:y,atual:m===mesSel&&y===anoSel};
  });
  const maxLucro=Math.max(...mesesGrafico.map(x=>Math.abs(x.lucro)),1);
  const chartH=120;

  const graficoLucroCard=(
    <Card>
      <CardHeader title={`📈 Evolução do Lucro — ${periodoGraf==="3"?"3 meses":periodoGraf==="12"?"12 meses":periodoGraf==="custom"?"Período personalizado":"6 meses"}`}/>
      <div style={{padding:"14px 20px"}}>

        {/* Chips de período */}
        <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
          {[{v:"3",l:"3 meses"},{v:"6",l:"6 meses"},{v:"12",l:"12 meses"},{v:"custom",l:"Personalizado"}].map(op=>(
            <button key={op.v} onClick={()=>setPeriodoGraf(op.v)}
              style={{padding:"6px 14px",borderRadius:20,border:`1.5px solid ${periodoGraf===op.v?C.orange:C.border}`,background:periodoGraf===op.v?C.orange:"transparent",color:periodoGraf===op.v?"#fff":C.text2,fontWeight:periodoGraf===op.v?700:400,fontSize:12,cursor:"pointer",transition:"all .15s"}}>
              {op.l}
            </button>
          ))}
        </div>

        {/* Campos de data personalizada — seletor de mês e ano */}
        {periodoGraf==="custom"&&(
          <div style={{background:C.navyLight,borderRadius:12,padding:"12px 14px",marginBottom:14}}>
            <div style={{color:C.navy,fontSize:14,fontWeight:700,marginBottom:10}}>Selecione o período:</div>
            <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
              <div style={{flex:1}}>
                <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:5}}>DE</div>
                <div style={{display:"flex",gap:6}}>
                  <select value={dataIni.split("/")[0]||""} onChange={e=>{const[,y]=dataIni.split("/");setDataIni(`${e.target.value}/${y||new Date().getFullYear()}`);}}
                    style={{flex:1,background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"8px 6px",fontSize:12,color:C.text,outline:"none"}}>
                    <option value="">Mês</option>
                    {MESES_PT.map((m,i)=><option key={i} value={String(i+1).padStart(2,"0")}>{m.slice(0,3)}</option>)}
                  </select>
                  <select value={dataIni.split("/")[1]||""} onChange={e=>{const[m]=dataIni.split("/");setDataIni(`${m||"01"}/${e.target.value}`);}}
                    style={{flex:1,background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"8px 6px",fontSize:12,color:C.text,outline:"none"}}>
                    <option value="">Ano</option>
                    {[2026,2027,2028,2029,2030].map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
              <div style={{color:C.muted,fontSize:14,paddingBottom:8}}>→</div>
              <div style={{flex:1}}>
                <div style={{color:C.muted,fontSize:10,fontWeight:700,marginBottom:5}}>ATÉ</div>
                <div style={{display:"flex",gap:6}}>
                  <select value={dataFim.split("/")[0]||""} onChange={e=>{const[,y]=dataFim.split("/");setDataFim(`${e.target.value}/${y||new Date().getFullYear()}`);}}
                    style={{flex:1,background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"8px 6px",fontSize:12,color:C.text,outline:"none"}}>
                    <option value="">Mês</option>
                    {MESES_PT.map((m,i)=><option key={i} value={String(i+1).padStart(2,"0")}>{m.slice(0,3)}</option>)}
                  </select>
                  <select value={dataFim.split("/")[1]||""} onChange={e=>{const[m]=dataFim.split("/");setDataFim(`${m||"01"}/${e.target.value}`);}}
                    style={{flex:1,background:"#fff",border:`1.5px solid ${C.border}`,borderRadius:9,padding:"8px 6px",fontSize:12,color:C.text,outline:"none"}}>
                    <option value="">Ano</option>
                    {[2026,2027,2028,2029,2030].map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            </div>
            {dataIni&&dataFim&&(
              <div style={{marginTop:10,color:C.navy,fontSize:12,textAlign:"center",fontWeight:600}}>
                📊 Mostrando: {MESES_PT[parseInt(dataIni.split("/")[0])-1]?.slice(0,3)} {dataIni.split("/")[1]} → {MESES_PT[parseInt(dataFim.split("/")[0])-1]?.slice(0,3)} {dataFim.split("/")[1]}
              </div>
            )}
          </div>
        )}

        {/* Gráfico */}
        {mesesGrafico.length>1?(
          <div style={{position:"relative",height:chartH+40,padding:"0 14px"}}>
            <div style={{position:"absolute",left:14,right:14,top:chartH/2,borderTop:`1px dashed ${C.border}`,zIndex:0}}/>
            <svg width="100%" height={chartH+30} style={{overflow:"visible",display:"block"}}>
              {mesesGrafico.map((p,i)=>{
                if(i===0)return null;
                const prev=mesesGrafico[i-1];
                const x1=(i-1)/(mesesGrafico.length-1)*100;
                const x2=i/(mesesGrafico.length-1)*100;
                const y1=chartH/2-(prev.lucro/maxLucro)*(chartH/2-10);
                const y2=chartH/2-(p.lucro/maxLucro)*(chartH/2-10);
                return <line key={i} x1={`${x1}%`} y1={y1} x2={`${x2}%`} y2={y2} stroke={C.navy} strokeWidth="2.5" strokeLinecap="round"/>;
              })}
              {mesesGrafico.map((p,i)=>{
                const x=i/(mesesGrafico.length-1)*100;
                const y=chartH/2-(p.lucro/maxLucro)*(chartH/2-10);
                const cor=p.lucro>=0?C.green:C.red;
                const isLast=i===mesesGrafico.length-1;
                const isFirst=i===0;
                const textAnchor=isLast?"end":isFirst?"start":"middle";
                return(
                  <g key={i}>
                    <circle cx={`${x}%`} cy={y} r={p.atual?8:5} fill={p.atual?C.orange:cor} stroke="#fff" strokeWidth="2"/>
                    <text x={`${x}%`} y={p.lucro>=0?y-13:y+20} textAnchor={textAnchor}
                      fill={p.atual?C.orange:cor} fontSize="10" fontWeight={p.atual?"800":"600"}>
                      {formatGraficoLucro(p.lucro)}
                    </text>
                  </g>
                );
              })}
            </svg>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
              {mesesGrafico.map((p,i)=>(
                <div key={i} style={{textAlign:"center",flex:1}}>
                  <div style={{color:p.atual?C.orange:C.muted,fontSize:10,fontWeight:p.atual?800:400}}>{p.label}</div>
                </div>
              ))}
            </div>
          </div>
        ):(
          <div style={{textAlign:"center",padding:"20px 0",color:C.muted,fontSize:14}}>
            {periodoGraf==="custom"?"Preencha as datas para ver o gráfico":"Sem dados suficientes para o gráfico"}
          </div>
        )}

        <div style={{background:C.navyLight,borderRadius:10,padding:"8px 12px",display:"flex",alignItems:"center",gap:6,marginTop:12}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:C.orange,flexShrink:0}}/>
          <span style={{color:C.navy,fontSize:12}}>Ponto laranja = mês selecionado · Valores ≥ R$ 10 mil exibidos em mil (k)</span>
        </div>
      </div>
    </Card>
  );

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>

      {/* Cabeçalho */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <h1 style={{color:C.navy,fontSize:22,fontWeight:900,fontFamily:"'Sora',sans-serif",margin:0}}>Financeiro</h1>
      </div>

      {/* Navegação mês anterior / próximo */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:C.navyLight,borderRadius:13,padding:"10px 16px"}}>
        <button onClick={prevMes} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"6px 12px",cursor:"pointer",color:C.navy,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
          <ChevronLeftIcon size={13}/> Anterior
        </button>
        <span style={{color:C.navy,fontWeight:800,fontSize:14,fontFamily:"'Sora',sans-serif"}}>{MESES_PT[mesSel]} {anoSel}</span>
        <button onClick={nextMes} style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:9,padding:"6px 12px",cursor:"pointer",color:C.navy,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
          Próximo <ChevronRightIcon size={13}/>
        </button>
      </div>

      {/* META DO MÊS — progresso no mês selecionado no navegador */}
      <div style={{background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,borderRadius:18,padding:"22px 24px",boxShadow:`0 6px 24px ${C.navy}44`}}>
        <div style={{color:"#BFDBFE",fontSize:14,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginBottom:12}}>🎯 Minha Meta do Mês</div>
        {editandoMeta?(
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <div style={{display:"flex",alignItems:"center",background:"#ffffff22",border:"1.5px solid #ffffff55",borderRadius:11,overflow:"hidden",flex:1}}>
              <span style={{padding:"0 10px",color:"#BFDBFE",fontSize:14,borderRight:"1px solid #ffffff33"}}>R$</span>
              <input value={formatMoedaParaCampo(draftMeta)} onChange={e=>setDraftMeta(formatEnquantoDigitaMoeda(e.target.value))} autoFocus
                style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#fff",padding:"10px 12px",fontSize:20,fontWeight:900,fontFamily:"'Sora',sans-serif"}}/>
            </div>
            <button onClick={()=>void salvarMeta()} disabled={salvandoMeta} style={{background:C.orange,border:"none",borderRadius:11,padding:"10px 16px",cursor:salvandoMeta?"wait":"pointer",color:"#fff",fontWeight:800,fontSize:14,opacity:salvandoMeta?0.7:1}}>{salvandoMeta?"…":"✓ Salvar"}</button>
          </div>
        ):(
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div>
              <div style={{color:"#93C5FD",fontSize:12,marginBottom:2}}>Meta definida</div>
              <div style={{color:C.orange,fontWeight:900,fontSize:34,fontFamily:"'Sora',sans-serif",lineHeight:1}}>{formatMoeda(metaMes)}</div>
            </div>
            <button onClick={()=>{setDraftMeta(formatMoedaParaCampo(metaMes));setEditandoMeta(true);}}
              style={{background:"#ffffff22",border:"1px solid #ffffff44",borderRadius:11,padding:"9px 15px",cursor:"pointer",color:"#fff",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",gap:6}}>
              <EditIcon size={13}/> Alterar
            </button>
          </div>
        )}
        <div style={{background:"#ffffff22",borderRadius:20,height:14,overflow:"hidden",marginBottom:10}}>
          <div style={{width:`${pctMeta}%`,height:"100%",background:atingiuMeta?"#22C55E":C.orange,borderRadius:20,transition:"width .4s"}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:"#BFDBFE",fontSize:12}}>Já recebi em {MESES_PT[mesSel]}</div>
            <div style={{color:"#fff",fontWeight:800,fontSize:18,fontFamily:"'Sora',sans-serif"}}>{formatMoeda(totalReceita)}</div>
          </div>
          {atingiuMeta?(
            <div style={{background:"#16A34A",borderRadius:12,padding:"8px 14px"}}><div style={{color:"#fff",fontWeight:800,fontSize:14}}>✓ Meta atingida!</div></div>
          ):(
            <div style={{textAlign:"right"}}>
              <div style={{color:"#BFDBFE",fontSize:12}}>Falta para a meta</div>
              <div style={{color:C.orange,fontWeight:800,fontSize:18,fontFamily:"'Sora',sans-serif"}}>{formatMoeda(faltaMeta)}</div>
            </div>
          )}
        </div>
        <div style={{color:"#93C5FD",fontSize:12,marginTop:10}}>
          {pctMeta.toLocaleString("pt-BR",{maximumFractionDigits:0})}% da meta concluída · Baseado no faturamento de fretes e jornadas
        </div>
      </div>

      {fretesMes.length===0&&maintMes.length===0&&despMes.length===0&&jornadasMes.length===0?(
        <div style={{background:C.subtle,border:`1px dashed ${C.border}`,borderRadius:14,padding:"32px 20px",textAlign:"center"}}>
          <div style={{fontSize:36,marginBottom:10}}>📊</div>
          <div style={{color:C.text,fontWeight:700,fontSize:14,marginBottom:6}}>Nenhum registro em {MESES_PT[mesSel]}</div>
          <div style={{color:C.muted,fontSize:14}}>Salve viagens, feche seu dia ou registre manutenções para ver o financeiro deste mês</div>
        </div>
      ):(
        <>
          {/* Saldo líquido */}
          <div style={{background:saldoLiquido>=0?"linear-gradient(135deg,#166534,#15803d)":"linear-gradient(135deg,#991B1B,#B91C1C)",borderRadius:14,padding:"15px 18px",boxShadow:saldoLiquido>=0?"0 4px 14px #16653433":"0 4px 14px #991B1B33"}}>
            <div style={{color:"rgba(255,255,255,0.72)",fontSize:12,fontWeight:700,letterSpacing:0.4,textTransform:"uppercase",marginBottom:5}}>Saldo Líquido do Mês</div>
            <div style={{color:"#fff",fontWeight:900,fontSize:28,fontFamily:"'Sora',sans-serif",lineHeight:1,whiteSpace:"nowrap"}}>
              {saldoLiquido>=0?"":"- "}{formatMoeda(Math.abs(saldoLiquido))}
            </div>
            <div style={{color:"rgba(255,255,255,0.78)",fontSize:11,marginTop:5,lineHeight:1.45}}>
              {saldoLiquido>=0?"✓ Mês positivo":"⚠ Despesas superaram receitas"} · {formatKm(totalKm)} km{margemPct!=null?` · Margem ${margemPct.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})}%`:""}
            </div>
            {hasPrevData&&(
              <div style={{color:diffSaldo>=0?"#BBF7D0":"#FECACA",fontSize:11,fontWeight:700,marginTop:4}}>
                {diffSaldo>=0?"▲":"▼"} {diffSaldo>=0?"+":""}{formatMoeda(Math.abs(diffSaldo))} vs {MESES_PT[prevMesIdx]}
              </div>
            )}
          </div>

          {/* Cards principais */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
            <Metric label="Receita bruta" value={formatMoeda(totalReceita)} sub={`${fretesMes.length} ${fretesMes.length===1?"viagem":"viagens"}${jornadasMes.length>0?` + ${jornadasMes.length} jornada${jornadasMes.length===1?"":"s"}`:""}`} trend="up" icon={TrendingUpIcon} color={C.green} bg={C.greenLight}/>
            <Metric label="Custo das viagens" value={formatMoeda(totalCusto)} sub="combustível + pedágio + ARLA" trend="down" icon={TrendingDownIcon} color={C.red} bg={C.redLight}/>
          </div>

          {totalMaint>0&&(
            <div style={{background:C.amberLight,border:`1px solid ${C.amber}33`,borderRadius:13,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><WrenchIcon size={15} color={C.amber}/><div><div style={{color:C.amber,fontWeight:700,fontSize:14}}>Manutenções do mês</div><div style={{color:C.amber,fontSize:12,opacity:0.8}}>{pluralRegistros(maintMes.length)}</div></div></div>
              <span style={{color:C.amber,fontWeight:800,fontSize:18,fontFamily:"'Sora',sans-serif",whiteSpace:"nowrap"}}>- {formatMoeda(totalMaint)}</span>
            </div>
          )}
          {totalDesp>0&&(
            <div style={{background:C.redLight,border:`1px solid ${C.red}33`,borderRadius:13,padding:"13px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}><DollarSignIcon size={15} color={C.red}/><div><div style={{color:C.red,fontWeight:700,fontSize:14}}>Despesas do mês</div><div style={{color:C.red,fontSize:12,opacity:0.8}}>{pluralRegistros(despMes.length)}</div></div></div>
              <span style={{color:C.red,fontWeight:800,fontSize:18,fontFamily:"'Sora',sans-serif",whiteSpace:"nowrap"}}>- {formatMoeda(totalDesp)}</span>
            </div>
          )}

          {/* V300 — Ganhos por App / Frete (fretes + jornadas por fonte) */}
          {ganhosPorFonte.length>0&&(
            <Card>
              <CardHeader title={`Ganhos por App / Frete — ${MESES_PT[mesSel]}`}/>
              <div>
                {ganhosPorFonte.map((g,i)=>(
                  <div key={g.servico} style={{padding:"13px 20px",borderBottom:i<ganhosPorFonte.length-1?`1px solid ${C.border}`:"none",display:"flex",alignItems:"center",gap:11}}>
                    <div style={{width:38,height:38,borderRadius:10,background:C.greenLight,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:18}}>{g.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:C.navy,fontWeight:700,fontSize:14}}>{g.servico}</div>
                      <div style={{color:C.muted,fontSize:12,marginTop:2}}>{g.tipo==="frete"?`${g.qtd} ${g.qtd===1?"viagem":"viagens"}`:`${g.qtd} ${g.qtd===1?"jornada":"jornadas"}`} · {formatKm(g.km)} km · custo {formatMoeda(g.custo)}</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{color:C.green,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif",whiteSpace:"nowrap"}}>{formatMoeda(g.receita)}</div>
                      <div style={{color:g.liquido>=0?C.green:C.red,fontSize:11,whiteSpace:"nowrap"}}>líq. {formatMoeda(g.liquido)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* R$/km */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:11}}>
            <div style={{background:C.navyLight,border:`1px solid ${C.navy}22`,borderRadius:14,padding:"14px 16px"}}>
              <div style={{color:C.text2,fontSize:11,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginBottom:6}}>Receita por km</div>
              <div style={{color:C.navy,fontWeight:900,fontSize:20,fontFamily:"'Sora',sans-serif",lineHeight:1,whiteSpace:"nowrap"}}>{formatMoedaKm(receitaKm)}</div>
              <div style={{color:C.muted,fontSize:10,marginTop:4}}>{formatKm(totalKm)} km no mês</div>
            </div>
            <div style={{background:lucroKm>=0?C.greenLight:C.redLight,border:`1px solid ${lucroKm>=0?C.green:C.red}22`,borderRadius:14,padding:"14px 16px"}}>
              <div style={{color:C.text2,fontSize:11,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",marginBottom:6}}>Lucro por km</div>
              <div style={{color:lucroKm>=0?C.green:C.red,fontWeight:900,fontSize:20,fontFamily:"'Sora',sans-serif",lineHeight:1,whiteSpace:"nowrap"}}>{formatMoedaKm(lucroKm)}</div>
              <div style={{color:C.muted,fontSize:10,marginTop:4}}>{lucroKm>=0?"Positivo":"Negativo"}</div>
            </div>
          </div>

          {/* Viagens do mês — resumo (fretes + jornadas) */}
          {(fretesMes.length>0||jornadasMes.length>0)&&(()=>{
            const totalViagens=fretesMes.length+jornadasMes.length;
            return(
            <Card>
              <CardHeader title={`Viagens — ${MESES_PT[mesSel]}`}/>
              <div style={{padding:"16px 20px"}}>
                <div style={{color:C.green,fontWeight:900,fontSize:22,fontFamily:"'Sora',sans-serif",lineHeight:1,whiteSpace:"nowrap"}}>
                  {formatMoeda(totalReceita)}
                </div>
                <div style={{color:C.muted,fontSize:13,marginTop:6}}>{totalViagens} {totalViagens===1?"viagem":"viagens"}</div>
              </div>
            </Card>
            );
          })()}
        </>
      )}

      {graficoLucroCard}
    </div>
  );
};

// ── PERFIL ────────────────────────────────────────────────────────────────────
const Perfil=({uid,perfil,setPerfil,onLimpar,onNav})=>{
  const[editMode,setEditMode]=useState(false);
  const[loadingPerfil,setLoadingPerfil]=useState(false);
  const[savingPerfil,setSavingPerfil]=useState(false);
  const[logoPreviewUrl,setLogoPreviewUrl]=useState("");
  const logoFileInputRef=useRef(null);
  const logoPendingBlobRef=useRef(null);
  const logoRemoveOnSaveRef=useRef(false);

  useEffect(()=>{
    if(!uid)return;
    let cancelled=false;
    setLoadingPerfil(true);
    (async()=>{
      try{
        const profile=await loadUserProfile(uid);
        if(cancelled)return;
        if(profile){
          const p=firestoreToPerfil(profile);
          setPerfil(p);
          writePerfilLocalCache(p);
        }else{
          setPerfil(readPerfilLocalFallback());
        }
      }catch{
        if(!cancelled)setPerfil(readPerfilLocalFallback());
      }finally{
        if(!cancelled)setLoadingPerfil(false);
      }
    })();
    return()=>{cancelled=true;};
  },[uid]);

  useEffect(()=>{
    if(logoPreviewUrl?.startsWith("blob:"))return;
    setLogoPreviewUrl(perfil?.empresaLogoUrl||"");
  },[perfil?.empresaLogoUrl]);

  const resetLogoDraft=()=>{
    logoPendingBlobRef.current=null;
    logoRemoveOnSaveRef.current=false;
    if(logoFileInputRef.current)logoFileInputRef.current.value="";
    setLogoPreviewUrl(perfil?.empresaLogoUrl||"");
  };

  const handleLogoFileChange=(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    logoPendingBlobRef.current=file;
    logoRemoveOnSaveRef.current=false;
    setLogoPreviewUrl((prev)=>{
      if(prev?.startsWith("blob:"))URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const handleRemoverLogo=()=>{
    logoPendingBlobRef.current=null;
    logoRemoveOnSaveRef.current=true;
    if(logoFileInputRef.current)logoFileInputRef.current.value="";
    setLogoPreviewUrl((prev)=>{
      if(prev?.startsWith("blob:"))URL.revokeObjectURL(prev);
      return "";
    });
  };

  const toggleEditMode=async()=>{
    if(!editMode){
      resetLogoDraft();
      setEditMode(true);
      return;
    }
    if(!uid){
      setEditMode(false);
      return;
    }
    setSavingPerfil(true);
    try{
      let nextPerfil={...perfil};
      if(logoRemoveOnSaveRef.current){
        nextPerfil.empresaLogoUrl="";
      }else if(logoPendingBlobRef.current){
        const jpeg=await compressImageToJpegBlob(logoPendingBlobRef.current,512);
        nextPerfil.empresaLogoUrl=await uploadEmpresaLogo(uid,jpeg);
      }
      await saveUserProfile(uid,perfilToFirestorePayload(nextPerfil));
      setPerfil(nextPerfil);
      writePerfilLocalCache(nextPerfil);
      if(logoPreviewUrl?.startsWith("blob:"))URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(nextPerfil.empresaLogoUrl||"");
      logoPendingBlobRef.current=null;
      logoRemoveOnSaveRef.current=false;
      if(logoFileInputRef.current)logoFileInputRef.current.value="";
      setEditMode(false);
    }catch{/* offline: mantém modo edição */}
    finally{setSavingPerfil(false);}
  };

  return(
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <h1 style={{color:C.navy,fontSize:22,fontWeight:900,fontFamily:"'Sora',sans-serif",margin:0,padding:"8px 0"}}>Meu Perfil</h1>

      {/* Atalho — consumo movido para Meu Veículo */}
      <button type="button" onClick={()=>onNav?.("manutencao")}
        style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:16,padding:"16px 18px",cursor:"pointer",textAlign:"left",boxShadow:"0 2px 8px #1E3A8A08",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,width:"100%"}}>
        <span style={{color:C.navy,fontWeight:700,fontSize:14,lineHeight:1.4}}>🚛 Consumo por veículo — agora em Meu Veículo</span>
        <ArrowRightIcon size={16} color={C.orange}/>
      </button>

      {/* DADOS DO PERFIL — preenchido automaticamente pelo cadastro */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"14px 20px 0"}}>
          <div style={{color:C.navy,fontWeight:800,fontSize:15,fontFamily:"'Sora',sans-serif",display:"flex",alignItems:"center",gap:7}}>
            <span>👤</span> Meus Dados
          </div>
          <button onClick={toggleEditMode} disabled={loadingPerfil||savingPerfil}
            style={{background:editMode?C.greenLight:C.orangeLight,border:`1px solid ${editMode?C.green:C.orange}33`,borderRadius:8,padding:"5px 12px",cursor:loadingPerfil||savingPerfil?"wait":"pointer",color:editMode?C.green:C.orange,fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:5,opacity:loadingPerfil||savingPerfil?0.6:1}}>
            {savingPerfil?"Salvando…":editMode?<><CheckIcon size={12}/> Salvar</>:<><EditIcon size={12}/> Editar</>}
          </button>
        </div>
        <div style={{padding:"12px 20px",display:"flex",flexDirection:"column",gap:12}}>
          {loadingPerfil&&(
            <div style={{background:C.navyLight,border:`1px solid ${C.navy}22`,borderRadius:10,padding:"9px 12px",color:C.navy,fontSize:12,fontWeight:600,textAlign:"center"}}>
              Carregando seus dados...
            </div>
          )}
          <div style={{background:C.navyLight,border:`1px solid ${C.navy}22`,borderRadius:10,padding:"9px 12px",display:"flex",alignItems:"center",gap:7,marginBottom:4}}>
            <InfoIcon size={13} color={C.navy}/>
            <span style={{color:C.navy,fontSize:12}}>Dados sincronizados com sua conta. Edite quando quiser.</span>
          </div>
          <Field label="Meu Nome" value={perfil.nome} onChange={v=>setPerfil(p=>({...p,nome:v}))} placeholder="Ex: João Silva" readOnly={!editMode}/>
          <Field label="Nome da empresa (opcional)" value={perfil.empresa||""} onChange={v=>setPerfil(p=>({...p,empresa:v}))} placeholder="Ex: Transportes Silva" readOnly={!editMode}/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <span style={{color:C.muted,fontSize:13,fontWeight:600}}>Logo da empresa (opcional)</span>
            <span style={{color:C.muted,fontSize:11,lineHeight:1.4}}>Aparece no cabeçalho dos PDFs do checklist. JPEG, enviado ao salvar.</span>
            {logoPreviewUrl?(
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <img src={logoPreviewUrl} alt="Logo da empresa" style={{width:72,height:72,objectFit:"contain",border:`1px solid ${C.border}`,borderRadius:10,background:"#fff",padding:4}}/>
                {editMode&&(
                  <button type="button" onClick={handleRemoverLogo} disabled={savingPerfil}
                    style={{background:C.redLight,border:`1px solid ${C.red}44`,borderRadius:8,padding:"7px 12px",cursor:savingPerfil?"wait":"pointer",color:C.red,fontSize:12,fontWeight:700}}>
                    Remover logo
                  </button>
                )}
              </div>
            ):(
              <div style={{color:C.muted,fontSize:12,fontStyle:"italic"}}>Nenhum logo cadastrado</div>
            )}
            {editMode&&(
              <>
                <input ref={logoFileInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={handleLogoFileChange}/>
                <button type="button" onClick={()=>logoFileInputRef.current?.click()} disabled={savingPerfil}
                  style={{alignSelf:"flex-start",background:C.subtle,border:`1.5px solid ${C.navy}`,borderRadius:8,padding:"8px 14px",cursor:savingPerfil?"wait":"pointer",color:C.navy,fontSize:12,fontWeight:700}}>
                  Escolher logo
                </button>
              </>
            )}
          </div>
          <Field label="E-mail" value={perfil.email} onChange={v=>setPerfil(p=>({...p,email:v}))} placeholder="Ex: joao@email.com" readOnly={!editMode}/>
          <Field label="WhatsApp / Telefone" value={perfil.telefone} onChange={v=>setPerfil(p=>({...p,telefone:v}))} placeholder="Ex: (11) 99999-9999" readOnly={!editMode}/>
          <Field label="Documento (CPF/RG/CNH)" value={perfil.documento||""} onChange={v=>setPerfil(p=>({...p,documento:v}))} placeholder="Ex: 000.000.000-00 ou RG" readOnly={!editMode}/>

          {/* Tipo de perfil */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:`1px solid ${C.border}`}}>
            <span style={{color:C.muted,fontSize:13}}>Tipo de perfil</span>
            {editMode?(
              <select value={perfil.tipo||""} onChange={e=>setPerfil(p=>({...p,tipo:e.target.value}))}
                style={{background:C.subtle,border:`1.5px solid ${C.orange}`,borderRadius:8,color:C.navy,padding:"5px 10px",fontSize:13,fontWeight:600,outline:"none"}}>
                {["Caminhoneiro","Guincheiro","Motoqueiro","Outros","Motorista Autônomo"].map(t=><option key={t} value={t}>{t}</option>)}
              </select>
            ):(
              <span style={{color:C.navy,fontWeight:700,fontSize:14}}>{perfil.tipo||"Não definido"}</span>
            )}
          </div>

          {/* Veículo principal */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderTop:`1px solid ${C.border}`}}>
            <span style={{color:C.muted,fontSize:13}}>Veículo principal</span>
            {editMode?(
              <select value={perfil.veiculo||""} onChange={e=>setPerfil(p=>({...p,veiculo:e.target.value}))}
                style={{background:C.subtle,border:`1.5px solid ${C.orange}`,borderRadius:8,color:C.navy,padding:"5px 10px",fontSize:13,fontWeight:600,outline:"none"}}>
                {DEFAULT_VEHICLES.map(v=><option key={v.id} value={v.id}>{v.emoji} {v.label}</option>)}
              </select>
            ):(
              <span style={{color:C.navy,fontWeight:700,fontSize:14}}>
                {DEFAULT_VEHICLES.find(v=>v.id===perfil.veiculo)?.emoji} {DEFAULT_VEHICLES.find(v=>v.id===perfil.veiculo)?.label||perfil.veiculo||"Não definido"}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* FAQ — botão que abre modal */}
      {(()=>{
        const FAQ_ITENS=[
          {cat:"🧮 Calculadora",perguntas:[
            {p:"Qual a diferença entre as duas calculadoras?",r:"A Calculadora de Viagem é para consulta rápida do custo de uma viagem (combustível, pedágio, ARLA) sem salvar. A Calculadora de Rotas + Frete calcula seu frete completo, salva no histórico e gera orçamento pra enviar no WhatsApp."},
            {p:"Por que meu resultado ficou diferente do esperado?",r:"Confira o consumo do veículo (km/L), o preço do combustível e o número de eixos do caminhão (afeta o pedágio). Pequenas diferenças nesses valores mudam o resultado final."},
          ]},
          {cat:"📦 Otimizador de Entregas",perguntas:[
            {p:"Como importo vários endereços de uma vez?",r:"Toque em \"Tirar foto do romaneio\" ou envie um PDF/foto da galeria — o app lê os endereços automaticamente. Você também pode digitar ou ditar pelo microfone."},
            {p:"O que é o número do pacote?",r:"É o número da etiqueta da caixa física. O app numera automaticamente na ordem em que os pacotes entram, e esse número nunca muda, mesmo se você reotimizar a rota. Assim você acha a caixa certa no carro. Dá pra editar tocando na parada."},
            {p:"O que é a \"Ordem de carregamento\"?",r:"É a lista invertida da sua rota: o pacote da última entrega é o primeiro a ser carregado, ficando no fundo do carro. Assim o primeiro a entregar sai por último."},
            {p:"Preciso otimizar sempre?",r:"Não. Se sua rota já vem pronta (como Shopee ou Amazon), use \"Usar rota como está\" — o app carrega os endereços na ordem original e não gasta suas otimizações."},
            {p:"O que acontece se eu marcar \"não entregue\"?",r:"Você escolhe o motivo (cliente ausente, recusou, endereço não encontrado ou outro) e a entrega fica registrada, ajudando na sua prestação de contas."},
          ]},
          {cat:"🌙 Fechamento do Dia",perguntas:[
            {p:"Pra que serve o \"Fechar meu dia\"?",r:"É para quem roda em apps. Você registra os km e os ganhos do dia, o app calcula o combustível pelo consumo do seu perfil e mostra seu lucro real, já lançado no Financeiro."},
            {p:"Qual a diferença entre viagem e jornada?",r:"Viagem (ou Frete) é um trajeto com origem e destino. Jornada é o seu dia de trabalho em apps como Uber e iFood, registrado pelo \"Fechar meu dia\". As duas aparecem juntas em Viagens."},
          ]},
          {cat:"💰 Financeiro",perguntas:[
            {p:"Como meu lucro é calculado?",r:"É a soma dos ganhos de fretes e jornadas do mês, menos os custos das viagens (combustível, pedágio, ARLA), menos manutenções e despesas do mês."},
            {p:"Por que meu histórico está vazio?",r:"O histórico mostra o mês selecionado. Use \"Anterior\" e \"Próximo\" para navegar entre os meses. Fretes e jornadas só aparecem depois de salvos."},
            {p:"Como funciona a meta mensal?",r:"Você define uma meta de faturamento no Financeiro. A barra mostra quanto já recebeu de fretes e jornadas no mês selecionado e quanto falta para bater a meta."},
          ]},
          {cat:"🔧 Manutenção e Documentos",perguntas:[
            {p:"Como funcionam os alertas de manutenção?",r:"Ao registrar uma manutenção, você informa o km atual e o app calcula quando será a próxima, avisando você quando estiver chegando perto."},
            {p:"O app guarda meus documentos?",r:"O app não guarda arquivos. Você cadastra as datas de vencimento (CNH, CRLV, Seguro) e recebe alertas: vermelho quando falta até 30 dias, amarelo até 60 dias, verde quando está em dia."},
          ]},
          {cat:"📋 Checklist de Veículo",perguntas:[
            {p:"O que é o Checklist de veículo?",r:"É uma vistoria com fotos e assinatura, em duas etapas (coleta e entrega), que gera um PDF pra proteger você e o cliente. A etapa de entrega só libera depois que a coleta estiver completa."},
          ]},
          {cat:"👤 Conta",perguntas:[
            {p:"Como recupero minha senha?",r:"Na tela de login, toque em \"Esqueci minha senha\" e siga as instruções enviadas para o seu e-mail cadastrado."},
            {p:"Como altero meus dados?",r:"Vá em Perfil > Meus Dados > Editar. Você pode atualizar nome, empresa, telefone e outros dados a qualquer momento."},
            {p:"Como crio uma conta?",r:"As contas são criadas no site logrotas.com.br. Na tela de login do app, toque no link \"Crie gratuitamente em logrotas.com.br\". Depois de criar, é só entrar no app com seu e-mail e senha."},
          ]},
          {cat:"📱 Suporte",perguntas:[
            {p:"Como falo com o suporte?",r:"Toque no botão de suporte abaixo para falar com a gente pelo WhatsApp, ou envie um e-mail para suporte@logrotas.com.br. Respondemos o mais rápido possível."},
          ]},
        ];
        const totalFaq=FAQ_ITENS.reduce((n,c)=>n+c.perguntas.length,0);
        const[showFaq,setShowFaq]=useState(false);
        const[open,setOpen]=useState(null);
        return(<>
          <button onClick={()=>setShowFaq(true)}
            style={{width:"100%",padding:"14px 18px",background:C.navyLight,border:`1.5px solid ${C.navy}22`,borderRadius:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:36,height:36,borderRadius:10,background:C.navy,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontSize:18}}>❓</span>
              </div>
              <div style={{textAlign:"left"}}>
                <div style={{color:C.navy,fontWeight:700,fontSize:14}}>Ajuda & Perguntas Frequentes</div>
                <div style={{color:C.muted,fontSize:11,marginTop:1}}>{totalFaq} perguntas respondidas</div>
              </div>
            </div>
            <ArrowRightIcon size={15} color={C.navy}/>
          </button>

          {showFaq&&(
            <ModalWrap maxW={480}>
              <ModalHeader title="Ajuda & FAQ" icon={InfoIcon} iconColor={C.navy} onClose={()=>{setShowFaq(false);setOpen(null);}}/>
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                {FAQ_ITENS.map((cat,ci)=>(
                  <div key={ci}>
                    <div style={{color:C.navy,fontWeight:700,fontSize:13,marginBottom:8}}>{cat.cat}</div>
                    {cat.perguntas.map((item,pi)=>(
                      <div key={pi} style={{marginBottom:6}}>
                        <button onClick={()=>setOpen(open===`${ci}-${pi}`?null:`${ci}-${pi}`)}
                          style={{width:"100%",background:open===`${ci}-${pi}`?C.navyLight:"#F8FAFC",border:`1px solid ${open===`${ci}-${pi}`?C.navy+"33":C.border}`,borderRadius:10,padding:"11px 14px",cursor:"pointer",textAlign:"left",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                          <span style={{color:C.navy,fontSize:13,fontWeight:600,flex:1}}>{item.p}</span>
                          <span style={{color:C.orange,fontSize:16,flexShrink:0}}>{open===`${ci}-${pi}`?"−":"+"}</span>
                        </button>
                        {open===`${ci}-${pi}`&&(
                          <div style={{background:C.navyLight,border:`1px solid ${C.navy}22`,borderRadius:"0 0 10px 10px",padding:"10px 14px",marginTop:-1}}>
                            <span style={{color:C.text2,fontSize:13,lineHeight:1.6}}>{item.r}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}

                <div style={{padding:"18px 16px",background:C.navyLight,border:`1.5px solid ${C.navy}22`,borderRadius:13,textAlign:"center"}}>
                  <div style={{color:C.navy,fontWeight:700,fontSize:14,marginBottom:8}}>📱 Falar com o suporte</div>
                  <div style={{color:C.muted,fontSize:13,lineHeight:1.55,marginBottom:12}}>
                    Não encontrou sua resposta? Envie um e-mail para nossa equipe:
                  </div>
                  <a href={`mailto:${SUPORTE_EMAIL}`} style={{color:C.orange,fontWeight:700,fontSize:15,textDecoration:"underline",textUnderlineOffset:3}}>{SUPORTE_EMAIL}</a>
                </div>
              </div>
            </ModalWrap>
          )}
        </>);
      })()}

      <div style={{textAlign:"center",color:C.muted,fontSize:11}}>LogRotas {APP_VERSION}</div>

      {/* BOTÃO LIMPAR — para recomeçar do zero */}
      <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
        <button onClick={onLimpar}
          style={{flexShrink:0,padding:"8px 12px",background:"transparent",border:`1.5px solid ${C.red}88`,borderRadius:10,cursor:"pointer",color:C.red,fontWeight:600,fontSize:12,whiteSpace:"nowrap"}}>
          🗑 Apagar dados
        </button>
        <p style={{margin:0,color:"#475569",fontSize:12,lineHeight:1.5}}>
          Apaga fretes, despesas, manutenções e documentos. Use apenas para recomeçar do zero.
        </p>
      </div>
    </div>
  );
};

// ── MAIN APP — vehicles state lives here, shared to Combustivel & Calculator ──
export default function App(){
  const[screen,setScreen]=useState("loading");
  // V294 — restaura a aba em que o usuário estava (PWA morto em 2º plano volta do zero)
  const[page,setPage]=useState(()=>readUiState()?.page||"dashboard");
  const[showCalc,setShowCalc]=useState(false);
  const[calcMode,setCalcMode]=useState(null);
  const uiRestoredRef=useRef(false);
  const[plan,setPlan]=useState("free");
  const[trialDias,setTrialDias]=useState(0);
  const perfilPlanoFirestoreRef=useRef(false);
  const[vehicles,setVehicles]=useState(()=>readVehiclesLocalCache(DEFAULT_VEHICLES));
  const[metaMes,setMetaMes]=useState(()=>readMetaMesLocalCache(8000));
  const[valorKm,setValorKm]=useState("");
  const[adicionalFixo,setAdicionalFixo]=useState("");
  const[historicoFretes,setHistoricoFretes]=useState([]);
  const[erroHistoricoSync,setErroHistoricoSync]=useState(false);
  const[manutencoes,setManutencoes]=useState([]);
  const[despesas,setDespesas]=useState([]);
  const[jornadas,setJornadas]=useState([]);
  const[showFechamento,setShowFechamento]=useState(false);
  const[docs,setDocs]=useState([]);
  const hoje=new Date();
  const docsVencidos=(docs||[]).filter(d=>{if(!d.expiry)return false;const[dia,mes,ano]=d.expiry.split("/");return new Date(ano,mes-1,dia)<hoje;});
  const docsVencendo30=(docs||[]).filter(d=>{if(!d.expiry)return false;const[dia,mes,ano]=d.expiry.split("/");const dias=Math.ceil((new Date(ano,mes-1,dia)-hoje)/(1000*60*60*24));return dias<=30&&dias>=0;});
  const docsVencendo=(docs||[]).filter(d=>{if(!d.expiry)return false;const[dia,mes,ano]=d.expiry.split("/");const dias=Math.ceil((new Date(ano,mes-1,dia)-hoje)/(1000*60*60*24));return dias<=60&&dias>=0;});
  const[perfil,setPerfil]=useState({nome:"",empresa:"",empresaLogoUrl:"",email:"",telefone:"",documento:"",tipo:"Motorista Autônomo",veiculo:"",servicosFechamento:[],precoCombustivel:""});
  const[checklistScreen,setChecklistScreen]=useState(null);
  const[ultimosAvulsos,setUltimosAvulsos]=useState([]);
  const[avulsosEmAndamento,setAvulsosEmAndamento]=useState([]);
  const checklistRestoredRef=useRef(false);
  const[showUltimosAvulsosModal,setShowUltimosAvulsosModal]=useState(false);
  const[avulsoPdfShare,setAvulsoPdfShare]=useState(null);
  const[gerandoAvulsoPdf,setGerandoAvulsoPdf]=useState(false);
  const[toastAvulso,setToastAvulso]=useState("");
  const[showAvaliacaoModal,setShowAvaliacaoModal]=useState(null);
  const avaliacaoInteragidaSessaoRef=useRef(false);
  const avaliacaoModalExibidoSessaoRef=useRef(false);
  const avaliacaoPendenteRef=useRef(null);
  const[authReady,setAuthReady]=useState(false);
  const[firebaseUser,setFirebaseUser]=useState(null);
  const[profileGateOk,setProfileGateOk]=useState(false);
  const[splashDone,setSplashDone]=useState(false);
  const[loadingExiting,setLoadingExiting]=useState(false);
  const[appVisible,setAppVisible]=useState(false);
  const navTabRefs=useRef({});
  const splashStartRef=useRef(Date.now());

  useEffect(()=>{
    if(!authReady)return;
    const decorrido=Date.now()-splashStartRef.current;
    const faltam=Math.max(0,MIN_SPLASH_MS-decorrido);
    const t=setTimeout(()=>setSplashDone(true),faltam);
    return()=>clearTimeout(t);
  },[authReady]);

  useEffect(()=>{
    if(!profileGateOk)return;
    if(perfilPlanoFirestoreRef.current||perfilTemCamposAcesso(perfil)){
      const{plan:nextPlan,trialDias:dias}=planStateFromPerfil(perfil);
      setPlan(nextPlan);
      setTrialDias(dias);
      return;
    }
    setPlan("free");
    setTrialDias(0);
  },[perfil,profileGateOk]);

  useEffect(()=>{
    return subscribeAuth((user)=>{
      setFirebaseUser(user);
      setAuthReady(true);
      if(user?.uid){
        try{
          localStorage.removeItem("logrotas_plano");
          localStorage.removeItem("logrotas_plano_expiry");
        }catch{/* ignore */}
      }
    });
  },[]);

  useEffect(()=>{
    if(!firebaseUser?.uid){
      setProfileGateOk(false);
      perfilPlanoFirestoreRef.current=false;
      return;
    }
    setProfileGateOk(false);
    let cancelled=false;
    (async()=>{
      try{
        const profile=await loadUserProfileWithTimeout(firebaseUser.uid);
        const isGoogle=firebaseUser.providerData?.some(p=>p.providerId==="google.com");
        if(isGoogle&&!profile){
          if(!cancelled){
            writeOfflineCache(AUTH_KEYS.googleSemConta,true);
            await signOutUser();
          }
          return;
        }
        if(cancelled)return;
        setProfileGateOk(true);
        void touchUltimoAcesso(firebaseUser.uid);
        if(profile){
          perfilPlanoFirestoreRef.current=true;
          const p=firestoreToPerfil(profile);
          setPerfil(p);
          writePerfilLocalCache(p);
          // Veículos: Firestore → localStorage → defaults (+ migração 1x se necessário)
          const fsVeh=extractVehiclesFromProfile(profile);
          const localVehRaw=readOfflineCache(OFFLINE_KEYS.vehicles);
          const hasLocalVeh=Array.isArray(localVehRaw)&&localVehRaw.length>0;
          if(fsVeh){
            const merged=mergeVehiclesWithDefaults(DEFAULT_VEHICLES,fsVeh);
            setVehicles(merged);
            writeVehiclesLocalCache(merged);
          }else if(hasLocalVeh){
            const merged=mergeVehiclesWithDefaults(DEFAULT_VEHICLES,localVehRaw);
            setVehicles(merged);
            writeVehiclesLocalCache(merged);
            void saveUserVehicles(firebaseUser.uid,merged).catch(()=>{/* offline: migra depois */});
          }else{
            setVehicles(DEFAULT_VEHICLES);
          }
          const fsCusto=extractCustoVeiculoFromProfile(profile);
          if(fsCusto){
            writeCustoVeiculoLocalCache(fsCusto);
          }else{
            const localCusto=readCustoVeiculoLocalCache();
            if(localCusto&&typeof localCusto==="object"){
              void saveUserCustoVeiculo(firebaseUser.uid,localCusto).catch(()=>{/* offline */});
            }
          }
          const fsMeta=extractMetaMesFromProfile(profile);
          if(fsMeta!=null){
            setMetaMes(fsMeta);
            writeMetaMesLocalCache(fsMeta);
          }else{
            const localMeta=readMetaMesLocalCache(0);
            if(localMeta>0){
              setMetaMes(localMeta);
              void saveUserMetaMes(firebaseUser.uid,localMeta).catch(()=>{/* offline */});
            }else{
              setMetaMes(8000);
              writeMetaMesLocalCache(8000);
            }
          }
        }else{
          perfilPlanoFirestoreRef.current=false;
          const local=readPerfilLocalFallback();
          setPerfil({
            ...local,
            nome:local.nome||firebaseUser.displayName||"",
            email:local.email||firebaseUser.email||"",
          });
          // Sem perfil no Firestore: mantém localStorage / defaults; migra se houver cache
          const localVehRaw=readOfflineCache(OFFLINE_KEYS.vehicles);
          if(Array.isArray(localVehRaw)&&localVehRaw.length>0){
            const merged=mergeVehiclesWithDefaults(DEFAULT_VEHICLES,localVehRaw);
            setVehicles(merged);
            void saveUserVehicles(firebaseUser.uid,merged).catch(()=>{/* offline */});
          }
          const localMeta=readMetaMesLocalCache(8000);
          setMetaMes(localMeta);
          if(localMeta>0){
            void saveUserMetaMes(firebaseUser.uid,localMeta).catch(()=>{/* offline */});
          }
        }
      }catch{
        if(!cancelled){
          setProfileGateOk(true);
          void touchUltimoAcesso(firebaseUser.uid);
          perfilPlanoFirestoreRef.current=false;
          const local=readPerfilLocalFallback();
          setPerfil({
            ...local,
            nome:local.nome||firebaseUser.displayName||"",
            email:local.email||firebaseUser.email||"",
          });
          // Offline/timeout: vehicles já vêm do useState(readVehiclesLocalCache)
        }
      }
    })();
    return()=>{cancelled=true;};
  },[firebaseUser?.uid]);

  useEffect(()=>{
    if(!firebaseUser?.uid){
      setHistoricoFretes([]);
      setManutencoes([]);
      setDespesas([]);
      setJornadas([]);
      setDocs([]);
      setErroHistoricoSync(false);
      return;
    }
    setErroHistoricoSync(false);
    const unsub=subscribeUserHistory(firebaseUser.uid,{
      onData:(data)=>{
        setHistoricoFretes(data.fretes||[]);
        setManutencoes(data.manutencao||[]);
        setDespesas(data.despesas||[]);
        setJornadas(data.jornadas||[]);
        setDocs(data.documentos||[]);
        setErroHistoricoSync(false);
      },
      onError:()=>{
        // NÃO zerar estado — preserva últimos dados válidos
        setErroHistoricoSync(true);
      },
    });
    return()=>{unsub();};
  },[firebaseUser?.uid]);

  const handleAddFrete=useCallback(async(item)=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    try{
      const rounded=roundFreteCostsForSave(item);
      const saved=await addFreteWithFinanceiro(uid,rounded);
      setHistoricoFretes(h=>[saved,...h]);
    }catch(err){
      console.error("[Frete] erro em salvar:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  const handleUpdateFrete=useCallback(async(item)=>{
    const uid=firebaseUser?.uid;
    if(!uid||!item?.id)return;
    try{
      const rounded=roundFreteCostsForSave(item);
      const saved=await updateFreteWithFinanceiro(uid,item.id,rounded);
      setHistoricoFretes(h=>h.map(x=>x.id===item.id?saved:x));
    }catch(err){
      console.error("[Frete] erro em atualizar:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  const handleDeleteFrete=useCallback(async(id)=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    try{
      await deleteFreteWithFinanceiro(uid,id);
      setHistoricoFretes(h=>h.filter(x=>x.id!==id));
    }catch(err){
      console.error("[Frete] erro em excluir:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  const handleOpenChecklist=useCallback(async(frete,existente)=>{
    const uid=firebaseUser?.uid;
    if(!uid||!frete?.id){
      logChecklist("warn","[Checklist] handleOpenChecklist abortado: uid ou frete.id ausente",{uid:!!uid,freteId:frete?.id});
      return;
    }
    try{
      const checklist=await openChecklistForFrete({
        uid,
        frete,
        existente,
        dados:{
          origem:{endereco:frete.origin||""},
          destino:{endereco:frete.dest||""},
        },
      });
      if(!checklist?.id){
        logChecklist("error","[Checklist] Checklist sem id após abrir/criar",{freteId:frete.id,checklist});
        return;
      }
      const etapa=etapaInicialParaChecklist(checklist);
      logChecklist("log","[Checklist] Abrindo checklist",{checklistId:checklist.id,freteId:frete.id,sync:checklist._sync?.state});
      setChecklistScreen({frete,checklist,resumeEtapa:etapa});
      writeChecklistSession({
        checklistId:checklist.id,
        avulso:false,
        freteId:frete.id,
        etapa,
      });
    }catch(err){
      logChecklist("error","[Checklist] Falha ao abrir/criar checklist:",err);
    }
  },[firebaseUser?.uid]);

  const refreshAvulsosDashboard=useCallback(async()=>{
    const uid=firebaseUser?.uid;
    if(!uid){
      setUltimosAvulsos([]);
      setAvulsosEmAndamento([]);
      return;
    }
    try{
      const[concluidos,emAndamento]=await Promise.all([
        listarChecklistsAvulsosRecentes(uid),
        listAvulsosEmAndamentoMerged(uid),
      ]);
      setUltimosAvulsos(concluidos);
      setAvulsosEmAndamento(emAndamento);
    }catch(err){
      logChecklist("error","[Checklist] Falha ao listar avulsos:",err);
      setUltimosAvulsos([]);
      setAvulsosEmAndamento([]);
    }
  },[firebaseUser?.uid]);

  useEffect(()=>{
    refreshAvulsosDashboard();
  },[refreshAvulsosDashboard]);

  useEffect(()=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    reenviarAvaliacoesPendentes(uid).catch(err=>{
      console.error("[Avaliacao] Falha ao reenviar pendentes no login:",err);
    });
  },[firebaseUser?.uid]);

  const tentarExibirAvaliacaoPendente=useCallback(()=>{
    if(avaliacaoModalExibidoSessaoRef.current)return;
    if(!avaliacaoPendenteRef.current)return;
    setShowAvaliacaoModal({origem:avaliacaoPendenteRef.current});
    avaliacaoModalExibidoSessaoRef.current=true;
    avaliacaoPendenteRef.current=null;
  },[]);

  const handleCalcConcluida=useCallback(async(origem)=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    if(origem==="viagem"){
      void incrementUsageCounter(uid,USAGE_COUNTERS.calculosViagem);
    }else if(origem==="roteirizacao"){
      void incrementUsageCounter(uid,USAGE_COUNTERS.rotasOtimizadas);
    }
    try{
      const {shouldShow}=await registrarConclusaoCalculadora(uid,origem,avaliacaoInteragidaSessaoRef.current);
      if(shouldShow)avaliacaoPendenteRef.current=origem;
    }catch(err){
      console.error("[Avaliacao] Falha ao registrar conclusão:",err);
    }
  },[firebaseUser?.uid]);

  const handleCalcModalClose=useCallback((extra)=>{
    extra?.();
    setShowCalc(false);
    setCalcMode(null);
    setTimeout(()=>tentarExibirAvaliacaoPendente(),120);
  },[tentarExibirAvaliacaoPendente]);

  const handleAvaliacaoDispensar=useCallback(async()=>{
    const uid=firebaseUser?.uid;
    avaliacaoInteragidaSessaoRef.current=true;
    setShowAvaliacaoModal(null);
    if(uid){
      try{await dispensarAvaliacao(uid);}catch(err){
        console.error("[Avaliacao] Falha ao dispensar:",err);
      }
    }
  },[firebaseUser?.uid]);

  const handleAvaliacaoEnviada=useCallback(()=>{
    avaliacaoInteragidaSessaoRef.current=true;
    setShowAvaliacaoModal(null);
  },[]);

  const handleAvaliacaoFalhaEnvio=useCallback((origem)=>{
    avaliacaoModalExibidoSessaoRef.current=false;
    if(origem)avaliacaoPendenteRef.current=origem;
  },[]);

  const handleNovoChecklistAvulso=useCallback(async()=>{
    const uid=firebaseUser?.uid;
    if(!uid){
      logChecklist("warn","[Checklist] Novo avulso abortado: sem uid");
      return;
    }
    try{
      const {checklist}=await createChecklist({uid,avulso:true,dados:{}});
      setChecklistScreen({frete:null,checklist,resumeEtapa:1});
      writeChecklistSession({
        checklistId:checklist.id,
        avulso:true,
        freteId:null,
        etapa:1,
      });
    }catch(err){
      logChecklist("error","[Checklist] Falha ao criar checklist avulso:",err);
    }
  },[firebaseUser?.uid]);

  const handleRetomarChecklistAvulso=useCallback(async(checklist)=>{
    if(!checklist?.id)return;
    const uid=firebaseUser?.uid;
    let cl=checklist;
    if(uid){
      try{
        const loaded=await loadChecklist(uid,checklist.id);
        if(loaded)cl=loaded;
      }catch(err){
        logChecklist("warn","[Checklist] Retomar: load local falhou, usando props",err);
      }
    }
    const sess=readChecklistSession();
    const etapa=etapaInicialParaChecklist(
      cl,
      sess?.checklistId===cl.id?sess.etapa:undefined
    );
    setChecklistScreen({frete:null,checklist:cl,resumeEtapa:etapa});
    writeChecklistSession({
      checklistId:cl.id,
      avulso:true,
      freteId:null,
      etapa,
    });
  },[firebaseUser?.uid]);

  const handleChecklistSaved=useCallback((c)=>{
    if(!c?.id){
      logChecklist("warn","[Checklist] onSaved ignorado: checklist sem id",c);
      return;
    }
    setChecklistScreen((s)=>{
      if(!s?.checklist?.id)return s;
      let resumeEtapa=s.resumeEtapa??1;
      if(c.status==="concluido")resumeEtapa=6;
      else if(c.status==="aguardando_entrega"&&resumeEtapa<5)resumeEtapa=5;
      return{...s,checklist:c,resumeEtapa};
    });
    if(c.status==="concluido")clearChecklistSession();
  },[]);

  const handleChecklistEtapaChange=useCallback((etapa)=>{
    setChecklistScreen((prev)=>{
      if(!prev?.checklist?.id)return prev;
      writeChecklistSession({
        checklistId:prev.checklist.id,
        avulso:!!prev.checklist.avulso||!prev.frete,
        freteId:prev.frete?.id||prev.checklist.freteId||null,
        etapa,
      });
      return{...prev,resumeEtapa:etapa};
    });
  },[]);

  const handleUltimosChecklists=useCallback(async()=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    try{
      const lista=await listarChecklistsAvulsosRecentes(uid);
      setUltimosAvulsos(lista);
      if(!lista.length){
        setToastAvulso("Nenhum checklist recente");
        setTimeout(()=>setToastAvulso(""),2500);
        return;
      }
      setShowUltimosAvulsosModal(true);
    }catch(err){
      logChecklist("error","[Checklist] Falha ao abrir últimos avulsos:",err);
    }
  },[firebaseUser?.uid]);

  const abrirPdfAvulsoSalvo=useCallback(async(checklistSalvo)=>{
    if(!checklistSalvo?.id||gerandoAvulsoPdf)return;
    setShowUltimosAvulsosModal(false);
    setGerandoAvulsoPdf(true);
    setAvulsoPdfShare(null);
    try{
      const uid=firebaseUser?.uid;
      let doc=checklistSalvo;
      if(uid){
        const loaded=await loadChecklist(uid,checklistSalvo.id);
        if(loaded)doc=loaded;
      }
      const {blob,filename}=await generateChecklistCompletoPdf({checklist:doc,frete:null,perfil});
      setAvulsoPdfShare({blob,filename,checklist:doc});
    }catch(err){
      logChecklist("error","[Checklist] Falha ao gerar PDF do avulso salvo:",err);
      setToastAvulso("Não foi possível gerar o PDF.");
      setTimeout(()=>setToastAvulso(""),3000);
    }finally{
      setGerandoAvulsoPdf(false);
    }
  },[gerandoAvulsoPdf,perfil,firebaseUser?.uid]);

  const handleAddDespesa=useCallback(async(item)=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    try{
      const saved=await addDespesaWithFinanceiro(uid,item);
      setDespesas(d=>[saved,...d]);
    }catch(err){
      console.error("[Despesa] erro em salvar:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  // V293 — Fechamento do dia: grava só a jornada (receita + custo próprios no Financeiro)
  const handleSaveJornada=useCallback(async(dados)=>{
    const uid=firebaseUser?.uid;
    if(!uid)throw new Error("Sem usuário");
    const{jornada}=await saveJornada(uid,dados);
    setJornadas(j=>[jornada,...j]);
  },[firebaseUser?.uid]);

  // V296 — editar / excluir jornada (Financeiro lê direto de `jornadas`, reflete sozinho)
  const handleUpdateJornada=useCallback(async(id,dados)=>{
    const uid=firebaseUser?.uid;
    if(!uid)throw new Error("Sem usuário");
    await updateHistoryItem(uid,HISTORY_COLLECTIONS.jornadas,id,dados);
    setJornadas(js=>js.map(j=>j.id===id?{...j,...dados}:j));
  },[firebaseUser?.uid]);

  const handleDeleteJornada=useCallback(async(id)=>{
    const uid=firebaseUser?.uid;
    if(!uid)throw new Error("Sem usuário");
    await deleteHistoryItem(uid,HISTORY_COLLECTIONS.jornadas,id);
    setJornadas(js=>js.filter(j=>j.id!==id));
  },[firebaseUser?.uid]);

  const handleUpdateDespesa=useCallback(async(item)=>{
    const uid=firebaseUser?.uid;
    if(!uid||!item?.id)return;
    try{
      const saved=await updateDespesaWithFinanceiro(uid,item.id,item);
      setDespesas(d=>d.map(x=>x.id===item.id?saved:x));
    }catch(err){
      console.error("[Despesa] erro em atualizar:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  const handleDeleteDespesa=useCallback(async(id)=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    try{
      await deleteDespesaWithFinanceiro(uid,id);
      setDespesas(d=>d.filter(x=>x.id!==id));
    }catch(err){
      console.error("[Despesa] erro em excluir:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  const handleAddManutencao=useCallback(async(item)=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    try{
      const saved=await addManutencaoWithFinanceiro(uid,item);
      setManutencoes(m=>[saved,...m]);
    }catch(err){
      console.error("[Manutencao] erro em salvar:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  const handleUpdateManutencao=useCallback(async(item)=>{
    const uid=firebaseUser?.uid;
    if(!uid||!item?.id)return;
    try{
      const saved=await updateManutencaoWithFinanceiro(uid,item.id,item);
      setManutencoes(m=>m.map(x=>x.id===item.id?saved:x));
    }catch(err){
      console.error("[Manutencao] erro em atualizar:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  const handleDeleteManutencao=useCallback(async(id)=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    try{
      await deleteManutencaoWithFinanceiro(uid,id);
      setManutencoes(m=>m.filter(x=>x.id!==id));
    }catch(err){
      console.error("[Manutencao] erro em excluir:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  const handleAddDocumento=useCallback(async(item)=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    try{
      const saved=await addDocumento(uid,item);
      setDocs(d=>[saved,...d]);
    }catch(err){
      console.error("[Documento] erro em salvar:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  const handleDeleteDocumento=useCallback(async(id)=>{
    const uid=firebaseUser?.uid;
    if(!uid)return;
    try{
      await deleteDocumento(uid,id);
      setDocs(d=>d.filter(x=>x.id!==id));
    }catch(err){
      console.error("[Documento] erro em excluir:",err);
      throw err;
    }
  },[firebaseUser?.uid]);

  useEffect(()=>{
    if(!splashDone||!authReady)return;
    let next=null;
    if(firebaseUser){
      if(profileGateOk)next="app";
    }else{
      next="login";
    }
    if(!next)return;
    setLoadingExiting(true);
    const t=setTimeout(()=>setScreen(next),320);
    return()=>clearTimeout(t);
  },[splashDone,authReady,firebaseUser,profileGateOk]);

  useEffect(()=>{
    if(screen==="app"){
      const id=requestAnimationFrame(()=>setAppVisible(true));
      return()=>{cancelAnimationFrame(id);setAppVisible(false);};
    }
    setAppVisible(false);
  },[screen]);

  useEffect(()=>{
    const tabEl=navTabRefs.current[page];
    if(tabEl?.scrollIntoView){
      tabEl.scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"});
    }
  },[page,screen]);

  // V310 — restaura checklist aberto após PWA morto (ex.: share PDF no WhatsApp)
  useEffect(()=>{
    if(screen!=="app"||!firebaseUser?.uid||!profileGateOk||checklistRestoredRef.current)return;
    checklistRestoredRef.current=true;
    (async()=>{
      const sess=readChecklistSession();
      if(!sess?.checklistId)return;
      try{
        const checklist=await loadChecklist(firebaseUser.uid,sess.checklistId);
        if(!checklist?.id||checklist.status==="concluido"){
          clearChecklistSession();
          return;
        }
        let frete=null;
        if(sess.freteId){
          frete=historicoFretes.find((f)=>f.id===sess.freteId)||null;
        }
        const etapa=etapaInicialParaChecklist(checklist,sess.etapa);
        setChecklistScreen({frete,checklist,resumeEtapa:etapa});
      }catch(err){
        logChecklist("error","[Checklist] Falha ao restaurar sessão:",err);
      }
    })();
  },[screen,firebaseUser?.uid,profileGateOk,historicoFretes]);

  // V310 — vincula frete ao checklist restaurado quando histórico carregar
  useEffect(()=>{
    if(!checklistScreen?.checklist?.freteId||checklistScreen.frete)return;
    const frete=historicoFretes.find((f)=>f.id===checklistScreen.checklist.freteId);
    if(frete)setChecklistScreen((s)=>({...s,frete}));
  },[historicoFretes,checklistScreen?.checklist?.freteId,checklistScreen?.frete]);

  // V317 — Fase 2d: processa fila UPLOAD_MEDIA ao reconectar
  useEffect(()=>{
    if(screen!=="app"||!firebaseUser?.uid||!profileGateOk)return undefined;
    return initChecklistConnectivity(firebaseUser.uid);
  },[screen,firebaseUser?.uid,profileGateOk]);

  // V294 — restaura o modal de calculadora/fechamento aberto ao reabrir (uma vez, já no app)
  useEffect(()=>{
    if(screen!=="app"||uiRestoredRef.current)return;
    uiRestoredRef.current=true;
    const ui=readUiState();
    if(!ui)return;
    // Não reabrir o otimizador se há navegação ativa — o banner já cuida da retomada
    const navAtiva=!!navBanner?.active;
    if(ui.showCalc&&ui.calcMode&&!(ui.calcMode==="otimizar"&&navAtiva)){
      setCalcMode(ui.calcMode);
      setShowCalc(true);
    }
    if(ui.showFechamento)setShowFechamento(true);
  },[screen]);

  // V294 — persiste a tela ativa (aba + modal aberto) enquanto no app
  useEffect(()=>{
    if(screen!=="app")return;
    writeUiState({page,showCalc,calcMode,showFechamento});
  },[screen,page,showCalc,calcMode,showFechamento]);

  useEffect(()=>{
    if(screen!=="loading")return;
    const prevBody=document.body.style.overflow;
    const prevHtml=document.documentElement.style.overflow;
    document.body.style.overflow="hidden";
    document.documentElement.style.overflow="hidden";
    return()=>{
      document.body.style.overflow=prevBody;
      document.documentElement.style.overflow=prevHtml;
    };
  },[screen]);

  const handleLogout=async()=>{
    try{
      await signOutUser();
    }catch{/* ignore */}
    clearVehiclesLocalCache();
    setVehicles(DEFAULT_VEHICLES);
    setPerfil({nome:"",empresa:"",empresaLogoUrl:"",email:"",telefone:"",documento:"",tipo:"Motorista Autônomo",veiculo:""});
    // V294 — não restaurar tela/modal antigos após trocar de conta
    clearUiState();
    uiRestoredRef.current=false;
    setShowCalc(false);
    setCalcMode(null);
    setShowFechamento(false);
    setPage("dashboard");
    setScreen("login");
  };

  const limparTudo=()=>{setConfirmLimpar(true);};
  const[confirmLimpar,setConfirmLimpar]=useState(false);
  const[showNotif,setShowNotif]=useState(false);
  const[navBanner,setNavBanner]=useState(()=>{
    const nav=readNavigationSession();
    return nav?.active?nav:null;
  });
  const[resumeNav,setResumeNav]=useState(false);
  const[navBannerDragY,setNavBannerDragY]=useState(0);
  // V287 — fechar o auxiliar "Navegação em andamento" arrastando pra baixo (~80px)
  const navBannerSwipe=useSwipeable({
    onSwiping:(e)=>{setNavBannerDragY(e.dir==="Down"?Math.abs(e.deltaY):0);},
    onSwipedDown:(e)=>{if(Math.abs(e.deltaY)>=80)clearNavigationSession();setNavBannerDragY(0);},
    onSwiped:()=>setNavBannerDragY(0),
    trackTouch:true,
    trackMouse:false,
    preventScrollOnSwipe:true,
  });

  useEffect(()=>{
    const handler=(e)=>{
      const detail=e.detail;
      setNavBanner(detail?.active?detail:null);
    };
    window.addEventListener("logrotas-nav-update",handler);
    return()=>window.removeEventListener("logrotas-nav-update",handler);
  },[]);

  const handleReturnToNavigation=useCallback(()=>{
    setShowCalc(true);
    setCalcMode("otimizar");
    setResumeNav(false);
    requestAnimationFrame(()=>setResumeNav(true));
  },[]);

  const showNavActiveBanner=navBanner?.active&&!navBanner?.modoNavegacao&&(navBanner?.totalParadas||0)>0;

  const NAV=[
    {id:"dashboard",  label:"Início",     icon:HomeIcon},
    {id:"financeiro", label:"Financeiro",  icon:BarChart3Icon},
    {id:"despesas",   label:"Despesas",    icon:DollarSignIcon},
    {id:"comparador", label:"Viagens",     icon:CalculatorIcon},
    {id:"manutencao", label:"Meu Veículo", icon:WrenchIcon},
    {id:"documentos", label:"Documentos",  icon:FileTextIcon},
    {id:"perfil",     label:"Perfil",      icon:SettingsIcon},
  ];

  const goSwipePage=useCallback((dir)=>{
    setPage(cur=>{
      const idx=PAGE_SWIPE_ORDER.indexOf(cur);
      if(idx<0)return cur;
      const next=dir==="left"?idx+1:idx-1;
      if(next<0||next>=PAGE_SWIPE_ORDER.length)return cur;
      return PAGE_SWIPE_ORDER[next];
    });
  },[]);

  const handlePageSwiped=useCallback((e)=>{
    if(e.absX<PAGE_SWIPE_MIN_PX)return;
    if(e.absX<=e.absY*PAGE_SWIPE_H_MIN_RATIO)return;
    goSwipePage(e.deltaX<0?"left":"right");
  },[goSwipePage]);

  const handlePageSwiping=useCallback((e)=>{
    const absDx=Math.abs(e.deltaX);
    const absDy=Math.abs(e.deltaY);
    if(absDx>absDy*PAGE_SWIPE_H_MIN_RATIO&&absDx>PAGE_SWIPE_MIN_PX){
      if(e.event?.cancelable)e.event.preventDefault();
    }
  },[]);

  const{ref:contentSwipeRef,...contentSwipeHandlers}=useSwipeable({
    delta:PAGE_SWIPE_DELTA,
    preventScrollOnSwipe:false,
    trackTouch:true,
    trackMouse:true,
    swipeDuration:Infinity,
    touchEventOptions:{passive:false},
    onSwiping:handlePageSwiping,
    onSwiped:handlePageSwiped,
  });

  if(screen==="loading"){return(
    <div style={{position:"fixed",inset:0,width:"100%",height:"100%",maxHeight:"100dvh",overflow:"hidden",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",paddingBottom:"calc(env(safe-area-inset-bottom, 0px) + 80px)",boxSizing:"border-box",opacity:loadingExiting?0:1,transition:"opacity 0.32s ease",background:C.bg}}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      {/* Imagem de fundo cobrindo tela inteira */}
      <img src="/splash.webp" alt="LogRotas" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center"}}/>
      {/* Overlay escuro suave no rodapé para os textos ficarem legíveis */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:"45%",background:"linear-gradient(to top, rgba(15,30,70,0.85) 0%, transparent 100%)"}}/>
      {/* Conteúdo sobre a imagem */}
      <div style={{position:"relative",zIndex:2,textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
        <div style={{display:"flex",gap:6,marginTop:8}}>
          {[0,1,2].map(i=>(
            <div key={i} style={{width:7,height:7,borderRadius:"50%",background:i===0?"#fff":"#ffffff66",animation:`pulse${i} 1.2s ${i*0.4}s infinite`}}/>
          ))}
        </div>
      </div>
      <style>{`@keyframes pulse0{0%,100%{opacity:1}50%{opacity:0.3}}@keyframes pulse1{0%,100%{opacity:0.3}50%{opacity:1}}@keyframes pulse2{0%,100%{opacity:0.5}50%{opacity:0.1}}`}</style>
    </div>
  );}

  if(screen==="login"){return(
    <div style={{minHeight:"100vh",fontFamily:"'DM Sans',sans-serif",background:"linear-gradient(160deg,#1E3A8A 0%,#2952C8 100%)"}}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <div style={{position:"relative",zIndex:2,width:"100%",maxWidth:480,margin:"0 auto"}}>
        <div style={{height:3,background:`linear-gradient(90deg,transparent,${C.orange},transparent)`}}/>
        <LoginScreen/>
      </div>
    </div>
  );}

  return(
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",background:C.bg,fontFamily:"'DM Sans',sans-serif",color:C.text,opacity:appVisible?1:0,transition:"opacity 0.35s ease"}}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
      <div style={{position:"sticky",top:0,zIndex:100,background:C.surface+"F8",backdropFilter:"blur(12px)",borderBottom:`1px solid ${C.border}`,padding:"0 18px",height:54,display:"flex",alignItems:"center",justifyContent:"space-between",boxShadow:"0 1px 8px #1E3A8A08"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <img src="/logo.png" alt="LogRotas" style={{width:32,height:32,objectFit:"cover",borderRadius:8,border:"1.5px solid #fff"}}/>
          <span style={{fontFamily:"'Sora',sans-serif",fontWeight:900,fontSize:20}}><span style={{color:C.navy}}>Log</span><span style={{color:C.orange}}>Rotas</span></span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:18}}>
          {/* Sininho com notificações */}
          <button onClick={()=>setShowNotif(true)} style={{background:"none",border:"none",cursor:"pointer",position:"relative",display:"flex",alignItems:"center",padding:0}}>
            <BellIcon size={18} color={C.navy}/>
            {(docsVencidos.length>0||docsVencendo30.length>0)&&<div style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:"50%",background:C.red}}/>}
          </button>
          <button onClick={handleLogout} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,display:"flex",alignItems:"center"}}><LogOutIcon size={17}/></button>
          <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(135deg,${C.navy},${C.navyMid})`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,color:"#fff",cursor:"pointer"}} onClick={()=>setPage("perfil")}>
            {perfil.nome?perfil.nome.charAt(0).toUpperCase():"J"}
          </div>
        </div>
      </div>
      <div style={{background:C.surface,borderBottom:`1px solid ${C.border}`,display:"flex",overflowX:"auto",padding:"0 6px",scrollbarWidth:"none"}}>
        {NAV.map(n=>{const active=page===n.id;return(
          <button key={n.id} ref={el=>{if(el)navTabRefs.current[n.id]=el;}} onClick={()=>setPage(n.id)} style={{display:"flex",alignItems:"center",gap:5,padding:"10px 12px",border:"none",background:"none",cursor:"pointer",color:active?C.orange:C.muted,fontWeight:active?700:500,fontSize:12,borderBottom:active?`2px solid ${C.orange}`:"2px solid transparent",whiteSpace:"nowrap",transition:"all .15s",flexShrink:0}}>
            <n.icon size={13}/>{n.label}
          </button>
        );})}
      </div>
      <div ref={contentSwipeRef} {...contentSwipeHandlers} style={{flex:1,minHeight:0,width:"100%",maxWidth:820,margin:"0 auto",overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch",padding:`20px 14px ${showNavActiveBanner?"128px":"80px"}`,touchAction:"pan-y pinch-zoom",boxSizing:"border-box"}}>
        <div style={{minHeight:"100%",width:"100%"}}>
        {page==="dashboard"   &&<Dashboard onNav={setPage} setShowCalc={setShowCalc} setCalcMode={setCalcMode} historicoFretes={historicoFretes} jornadas={jornadas} manutencoes={manutencoes} docs={docs} despesas={despesas} perfil={perfil} onNovoChecklist={handleNovoChecklistAvulso} onUltimosChecklists={handleUltimosChecklists} ultimosAvulsosCount={ultimosAvulsos.length} avulsosEmAndamento={avulsosEmAndamento} onRetomarChecklist={handleRetomarChecklistAvulso} onFecharDia={()=>setShowFechamento(true)} erroHistoricoSync={erroHistoricoSync}/>}
        {page==="financeiro"  &&<Financeiro historicoFretes={historicoFretes} manutencoes={manutencoes} despesas={despesas} jornadas={jornadas} uid={firebaseUser?.uid} metaMes={metaMes} setMetaMes={setMetaMes}/>}
        {page==="despesas"    &&<Despesas despesas={despesas} onAddDespesa={handleAddDespesa} onUpdateDespesa={handleUpdateDespesa} onDeleteDespesa={handleDeleteDespesa} uid={firebaseUser?.uid} perfil={perfil}/>}
        {page==="comparador"  &&<Comparador historicoFretes={historicoFretes} jornadas={jornadas} onAddFrete={handleAddFrete} onUpdateFrete={handleUpdateFrete} onDeleteFrete={handleDeleteFrete} onUpdateJornada={handleUpdateJornada} onDeleteJornada={handleDeleteJornada} perfil={perfil} uid={firebaseUser?.uid} onOpenChecklist={handleOpenChecklist}/>}
        {page==="manutencao"  &&<Manutencao manutencoes={manutencoes} onAddManutencao={handleAddManutencao} onUpdateManutencao={handleUpdateManutencao} onDeleteManutencao={handleDeleteManutencao} uid={firebaseUser?.uid} perfil={perfil} vehicles={vehicles} setVehicles={setVehicles} historicoFretes={historicoFretes} jornadas={jornadas}/>}
        {page==="documentos"  &&<Documentos docs={docs} onAddDocumento={handleAddDocumento} onDeleteDocumento={handleDeleteDocumento} uid={firebaseUser?.uid} perfil={perfil}/>}
        {page==="perfil"      &&<Perfil uid={firebaseUser?.uid} perfil={perfil} setPerfil={setPerfil} onLimpar={limparTudo} onNav={setPage}/>}
        </div>
      </div>
      {page!=="dashboard"&&(<button onClick={()=>{setCalcMode(null);setShowCalc(true);}} style={{position:"fixed",bottom:22,right:18,width:52,height:52,borderRadius:"50%",background:C.orange,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 20px ${C.orange}55`,zIndex:90}}><RouteIcon size={22} color="#fff"/></button>)}
      {checklistScreen?.checklist?.id&&(
        <ChecklistVeiculo
          key={checklistScreen.checklist.id}
          checklist={checklistScreen.checklist}
          frete={checklistScreen.frete}
          uid={firebaseUser?.uid}
          perfil={perfil}
          initialEtapa={checklistScreen.resumeEtapa}
          onClose={()=>{clearChecklistSession();setChecklistScreen(null);refreshAvulsosDashboard();}}
          onAvulsoFinalizado={refreshAvulsosDashboard}
          onSaved={handleChecklistSaved}
          onEtapaChange={handleChecklistEtapaChange}
        />
      )}
      {gerandoAvulsoPdf&&(
        <div style={{position:"fixed",inset:0,zIndex:970,background:"#1E3A8A44",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.surface,borderRadius:16,padding:"20px 28px",color:C.navy,fontWeight:700,fontSize:14,boxShadow:"0 8px 32px #00000022"}}>
            ⏳ Gerando PDF…
          </div>
        </div>
      )}
      {showUltimosAvulsosModal&&ultimosAvulsos.length>0&&(
        <div style={{position:"fixed",inset:0,background:"#1E3A8A66",zIndex:960,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={()=>setShowUltimosAvulsosModal(false)}>
          <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:400,padding:22,boxShadow:"0 12px 40px #00000033"}} onClick={e=>e.stopPropagation()}>
            <div style={{color:C.navy,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif",marginBottom:14}}>Últimos checklists</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {ultimosAvulsos.map((cl)=>{
                const {numero,data,endereco}=resumoChecklistAvulso(cl);
                return(
                  <button
                    key={cl.id}
                    type="button"
                    onClick={()=>abrirPdfAvulsoSalvo(cl)}
                    style={{width:"100%",padding:"12px 14px",background:C.card,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",textAlign:"left"}}
                  >
                    <div style={{color:C.navy,fontWeight:800,fontSize:14,fontFamily:"'Sora',sans-serif"}}>Nº {numero}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:4}}>{data} · {endereco}</div>
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={()=>setShowUltimosAvulsosModal(false)} style={{width:"100%",marginTop:14,padding:"11px 0",background:C.subtle,border:`1px solid ${C.border}`,borderRadius:11,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:14}}>
              Fechar
            </button>
          </div>
        </div>
      )}
      {avulsoPdfShare&&createPortal(
        <div style={{position:"fixed",inset:0,zIndex:1100,background:"#1E3A8A66",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:360,padding:24,boxShadow:"0 12px 40px #00000033",textAlign:"center"}}>
            <div style={{fontSize:36,marginBottom:8}}>📄</div>
            <div style={{color:C.navy,fontWeight:800,fontSize:16,fontFamily:"'Sora',sans-serif",marginBottom:8}}>PDF gerado!</div>
            <div style={{color:C.muted,fontSize:13,marginBottom:8,lineHeight:1.5}}>
              Checklist {avulsoPdfShare.checklist?.numero||"—"}
            </div>
            <div style={{color:C.muted,fontSize:12,marginBottom:18,lineHeight:1.5}}>Compartilhe o laudo completo:</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {avulsoPdfShare.blob&&(
                <button
                  type="button"
                  onClick={async()=>{
                    try{
                      await sharePdfFileViaSystem(avulsoPdfShare.blob,avulsoPdfShare.filename||"checklist-completo.pdf");
                    }catch{
                      shareChecklistCompletoWhatsApp({checklist:avulsoPdfShare.checklist,frete:null,perfil});
                    }
                  }}
                  style={{width:"100%",padding:13,background:C.navy,border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14}}
                >
                  📄 Enviar PDF no WhatsApp
                </button>
              )}
              <button
                type="button"
                onClick={()=>setAvulsoPdfShare(null)}
                style={{width:"100%",padding:12,background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:14}}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {toastAvulso&&(
        <div style={{position:"fixed",bottom:90,left:"50%",transform:"translateX(-50%)",zIndex:980,background:C.navy,color:"#fff",padding:"10px 18px",borderRadius:10,fontSize:13,fontWeight:600,boxShadow:"0 4px 20px #00000033"}}>
          {toastAvulso}
        </div>
      )}
      {/* Modal notificações */}
      {showNotif&&(
        <div style={{position:"fixed",inset:0,background:"#00000044",zIndex:200,display:"flex",alignItems:"flex-start",justifyContent:"flex-end",padding:"58px 12px 0"}} onClick={()=>setShowNotif(false)}>
          <div style={{background:"#fff",borderRadius:16,width:300,maxHeight:400,overflowY:"auto",boxShadow:"0 8px 32px #00000033",padding:"16px 0"}} onClick={e=>e.stopPropagation()}>
            <div style={{color:C.navy,fontWeight:800,fontSize:15,padding:"0 16px 12px",borderBottom:`1px solid ${C.border}`,fontFamily:"'Sora',sans-serif"}}>🔔 Notificações</div>
            {docsVencidos.length===0&&docsVencendo30.length===0&&docsVencendo.length===0?(
              <div style={{padding:"24px 16px",textAlign:"center",color:C.muted,fontSize:13}}>
                <div style={{fontSize:32,marginBottom:8}}>✅</div>
                Tudo em dia! Sem alertas no momento.
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column"}}>
                {docsVencidos.map((d,i)=>(
                  <div key={i} onClick={()=>{setPage("documentos");setShowNotif(false);}} style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:18}}>🚨</span>
                    <div><div style={{color:C.red,fontWeight:700,fontSize:13}}>Documento vencido!</div><div style={{color:C.muted,fontSize:12,marginTop:1}}>{d.type} — {d.vehicle||"seu veículo"}</div></div>
                  </div>
                ))}
                {docsVencendo30.filter(d=>!docsVencidos.includes(d)).map((d,i)=>(
                  <div key={i} onClick={()=>{setPage("documentos");setShowNotif(false);}} style={{padding:"12px 16px",borderBottom:`1px solid ${C.border}`,cursor:"pointer",display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:18}}>⚠️</span>
                    <div><div style={{color:C.amber,fontWeight:700,fontSize:13}}>Vence em breve!</div><div style={{color:C.muted,fontSize:12,marginTop:1}}>{d.type} — {d.vehicle||"seu veículo"}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {showCalc&&calcMode===null&&<CalcSelector
        onFrete={()=>setCalcMode("frete")}
        onViagem={()=>setCalcMode("viagem")}
        onOtimizar={()=>setCalcMode("otimizar")}
        onClose={()=>handleCalcModalClose()}/>}
      {showCalc&&calcMode==="viagem"&&<TripCalcModal onClose={()=>handleCalcModalClose()} onConcluido={handleCalcConcluida} vehicles={vehicles} onGoMeuVeiculo={()=>{handleCalcModalClose();setPage("manutencao");}}/>}
      {showCalc&&calcMode==="frete"&&<RouteCalcModal onClose={()=>handleCalcModalClose()} onConcluido={handleCalcConcluida} vehicles={vehicles} valorKmPadrao={valorKm} adicionalPadrao={adicionalFixo} onSalvarHistorico={handleAddFrete} perfil={perfil} uid={firebaseUser?.uid} onGoMeuVeiculo={()=>{handleCalcModalClose();setPage("manutencao");}}/>}
      {showCalc&&calcMode==="otimizar"&&<OtimizarEntregasModal uid={firebaseUser?.uid} resumeNavigation={resumeNav} onNavigationResumed={()=>setResumeNav(false)} onClose={()=>handleCalcModalClose(()=>setResumeNav(false))} onConcluido={handleCalcConcluida} perfil={perfil} plan={plan}/>}
      {showFechamento&&<FechamentoDia uid={firebaseUser?.uid} perfil={perfil} setPerfil={setPerfil} vehicles={vehicles} onSalvar={handleSaveJornada} onClose={()=>setShowFechamento(false)} onGoMeuVeiculo={()=>{setShowFechamento(false);setPage("manutencao");}}/>}
      <AvaliacaoAppModal
        open={!!showAvaliacaoModal}
        origem={showAvaliacaoModal?.origem}
        perfil={perfil}
        uid={firebaseUser?.uid}
        onDispensar={handleAvaliacaoDispensar}
        onEnviado={handleAvaliacaoEnviada}
        onFalhaEnvio={handleAvaliacaoFalhaEnvio}
      />

      {/* V233 — barra inteira clicável (volta ao mapa); V287 — arraste pra baixo fecha */}
      {showNavActiveBanner&&(
        <div {...navBannerSwipe} role="button" tabIndex={0} onClick={handleReturnToNavigation}
          onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")handleReturnToNavigation();}}
          style={{position:"fixed",bottom:0,left:0,right:0,zIndex:880,background:"linear-gradient(135deg,#1E3A8A,#2563EB)",boxShadow:"0 -4px 20px #1E3A8A44",padding:"8px 14px calc(12px + env(safe-area-inset-bottom))",cursor:"pointer",transform:`translateY(${navBannerDragY}px)`,transition:navBannerDragY?"none":"transform .2s ease",touchAction:"none"}}>
          <div style={{width:40,height:4,borderRadius:4,background:"rgba(255,255,255,0.55)",margin:"0 auto 8px"}}/>
          <div style={{maxWidth:820,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:"#fff",fontWeight:800,fontSize:14,fontFamily:"'Sora',sans-serif"}}>
                🧭 Navegação em andamento — Parada {(navBanner.paradaAtualIdx??0)+1} de {navBanner.totalParadas}
              </div>
              <div style={{color:"rgba(255,255,255,0.7)",fontSize:11,marginTop:2}}>
                Arraste pra baixo para fechar
              </div>
            </div>
            <button type="button" onClick={e=>{e.stopPropagation();handleReturnToNavigation();}}
              style={{flexShrink:0,background:"#fff",border:"none",borderRadius:10,padding:"9px 14px",color:OTIMIZAR_AZUL,fontWeight:800,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>
              Voltar ao mapa
            </button>
          </div>
        </div>
      )}

      {confirmLimpar&&(
        <div style={{position:"fixed",inset:0,background:"#00000066",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
          <div style={{background:"#fff",borderRadius:20,width:"100%",maxWidth:360,padding:28,boxShadow:"0 20px 60px #00000033",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>⚠️</div>
            <div style={{color:C.navy,fontWeight:800,fontSize:17,fontFamily:"'Sora',sans-serif",marginBottom:8}}>Apagar todos os dados?</div>
            <div style={{color:C.muted,fontSize:14,lineHeight:1.6,marginBottom:24}}>Isso vai remover todos os fretes, despesas, documentos e manutenções. Essa ação não pode ser desfeita.</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmLimpar(false)}
                style={{flex:1,padding:"13px",background:C.subtle,border:`1px solid ${C.border}`,borderRadius:12,cursor:"pointer",color:C.text2,fontWeight:600,fontSize:14}}>
                Cancelar
              </button>
              <button onClick={async()=>{
                const uid=firebaseUser?.uid;
                if(uid){
                  try{await clearAllUserHistory(uid);}catch{/* ignore */}
                }
                try{await signOutUser();}catch{/* ignore */}
                clearAllLogRotasStorage();
                setHistoricoFretes([]);setManutencoes([]);setDespesas([]);setJornadas([]);setDocs([]);
                setMetaMes(8000);setValorKm("");setAdicionalFixo("");
                setVehicles(DEFAULT_VEHICLES);
                setPerfil({nome:"",empresa:"",empresaLogoUrl:"",email:"",telefone:"",documento:"",tipo:"Motorista Autônomo",veiculo:""});
                setPlan("free");
                setTrialDias(0);
                perfilPlanoFirestoreRef.current=false;
                setConfirmLimpar(false);
                // V294 — zera estado de tela/modal para não restaurar nada após apagar tudo
                clearUiState();
                uiRestoredRef.current=false;
                setShowCalc(false);setCalcMode(null);setShowFechamento(false);
                setPage("dashboard");
                setScreen("login");
              }} style={{flex:1,padding:"13px",background:C.red,border:"none",borderRadius:12,cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                <Trash2Icon size={14}/> Apagar tudo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

