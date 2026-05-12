import { useEffect, useMemo, useState } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Modal,
  Alert,
  Paper,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Typography
} from "@mui/material";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import type { NaverCandidate, NaverPriceResult, Product } from "./api";
import { backend } from "./api";

type TabKey = "dashboard" | "products";

export default function App() {
  const [tab, setTab] = useState<TabKey>("dashboard");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [refreshResults, setRefreshResults] = useState<NaverPriceResult[]>([]);
  const [candidatesOpen, setCandidatesOpen] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const [selectedRow, setSelectedRow] = useState<{
    product: Product;
    result?: NaverPriceResult;
    candidates: NaverCandidate[];
  } | null>(null);

  const [uploadSnackbarOpen, setUploadSnackbarOpen] = useState(false);
  const [uploadSnackbarMsg, setUploadSnackbarMsg] = useState<string>("");
  const [toastSeverity, setToastSeverity] = useState<"success" | "error">("success");
  const [listError, setListError] = useState<string | null>(null);

  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [clearAllText, setClearAllText] = useState("");
  const [clearAllBusy, setClearAllBusy] = useState(false);

  function notify(msg: string, severity: "success" | "error" = "success") {
    setUploadSnackbarMsg(msg);
    setToastSeverity(severity);
    setUploadSnackbarOpen(true);
  }

  async function downloadUploadTemplate() {
    try {
      const blob = await backend.downloadUploadTemplateXlsx();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "products_upload_template_200.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      notify(e instanceof Error ? e.message : "양식 다운로드 실패", "error");
    }
  }

  async function clearAllProducts() {
    setClearAllBusy(true);
    try {
      await backend.clearAllProducts();
      setRefreshResults([]);
      setSelectedProductId(null);
      notify("전체 삭제 완료", "success");
      await loadProducts();
      setClearAllOpen(false);
      setClearAllText("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "전체 삭제 실패", "error");
    } finally {
      setClearAllBusy(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    try {
      const r = await backend.uploadProductsXlsx(file);
      notify(`업로드 완료 · 총 ${r.totalRows}행 / 신규 ${r.inserted} / 업데이트 ${r.updated} / 실패 ${r.failed}`, "success");
      await loadProducts();
    } catch (e) {
      notify(e instanceof Error ? e.message : "업로드 실패", "error");
    }
  }

  async function loadProducts() {
    try {
      const items = await backend.listProducts();
      setProducts(items);
      setListError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "상품 목록을 불러오지 못했습니다.";
      setListError(msg);
      // eslint-disable-next-line no-console
      console.error("[ui] loadProducts failed", e);
    }
  }

  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function money(n: number | null | undefined) {
    if (n == null || !Number.isFinite(n)) return "-";
    return n.toLocaleString("ko-KR");
  }

  type UiStatus = "정상" | "조정필요" | "긴급조정" | "조회실패";

  function computeStatus(ourPrice: number | null | undefined, effectivePrice: number | null | undefined): UiStatus {
    if (ourPrice == null || effectivePrice == null) return "조회실패";
    if (!Number.isFinite(ourPrice) || !Number.isFinite(effectivePrice) || effectivePrice <= 0) return "조회실패";
    if (ourPrice <= effectivePrice) return "정상";
    if (ourPrice > effectivePrice * 1.1) return "긴급조정";
    return "조정필요";
  }

  function diffColor(diff: number | null | undefined, effectivePrice: number | null | undefined) {
    if (diff == null || !Number.isFinite(diff) || effectivePrice == null || !Number.isFinite(effectivePrice)) {
      return "text.secondary";
    }
    if (diff < 0) return "text.secondary"; // 가격 경쟁력 있음
    if (diff === 0) return "success.main"; // 정상
    if (diff > effectivePrice * 0.1) return "error.main"; // 긴급조정
    return "warning.main"; // 조정필요
  }

  function statusChip(status: UiStatus) {
    if (status === "조회실패") return <Chip size="small" label="조회실패" variant="filled" />;
    const color = status === "정상" ? "success" : status === "조정필요" ? "warning" : "error";
    return <Chip size="small" label={status} color={color} variant="filled" />;
  }

  function excludedReasonKo(reason: NaverCandidate["excludedReason"] | undefined) {
    if (!reason) return "-";
    if (reason === "PASSED") return "포함";
    if (reason === "HARD_FILTER_EXCLUDE_KEYWORD") return "제외 키워드 포함";
    if (reason === "VOLUME_MISMATCH") return "용량 불일치";
    if (reason === "TOKEN_MISMATCH") return "상품명 불일치";
    if (reason === "LOW_SCORE") return "점수 낮음";
    return reason;
  }

  async function refreshAll() {
    setLoading(true);
    try {
      const resp = await backend.refreshAllNaver();
      setRefreshResults(resp.results ?? []);
      await loadProducts();
    } catch (e) {
      notify(e instanceof Error ? e.message : "전체 가격 갱신에 실패했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }

  const resultByProductId = useMemo(() => {
    const m = new Map<string, NaverPriceResult>();
    for (const r of refreshResults) m.set(r.productId, r);
    return m;
  }, [refreshResults]);

  const rows = useMemo(() => {
    const enriched = products.map((p) => {
      const r = resultByProductId.get(p.id);
      const ourPrice = p.ourPrice ?? r?.ourPrice ?? null;
      const effective = r?.selected?.effectivePrice ?? null;
      const diff = ourPrice != null && effective != null ? ourPrice - effective : null;
      const status = computeStatus(ourPrice, effective);
      const recommended = effective != null && Number.isFinite(effective) ? Math.max(0, effective - 1000) : null;
      return {
        product: p,
        result: r,
        ourPrice,
        effective,
        diff,
        status,
        recommended
      };
    });
    // 우리 가격 차이 높은 순 (문제 큰 상품 위로)
    enriched.sort((a, b) => (b.diff ?? Number.NEGATIVE_INFINITY) - (a.diff ?? Number.NEGATIVE_INFINITY));
    return enriched;
  }, [products, resultByProductId]);

  const filteredRows = rows;

  async function openCandidates(product: Product, result?: NaverPriceResult) {
    // 방어: productId 없으면 호출하지 않음
    if (!product?.id) {
      setCandidatesOpen(true);
      setCandidatesLoading(false);
      setCandidatesError("productId가 없어 후보를 불러올 수 없습니다.");
      setSelectedRow({ product, result, candidates: [] });
      setSelectedProductId(null);
      return;
    }

    setCandidatesOpen(true);
    setCandidatesLoading(true);
    setCandidatesError(null);
    setSelectedRow({ product, result, candidates: [] });
    setSelectedProductId(product.id);
    try {
      // 방어: selectedProductId가 null이면 호출하지 않음
      if (!product.id) throw new Error("productId가 비어 있습니다.");
      const resp = await backend.naverCandidates(product.id);
      setSelectedRow({
        product,
        result: resp,
        candidates: resp._allCandidates ?? []
      });
    } catch (e) {
      // 콘솔 에러가 나더라도 UI는 유지
      // eslint-disable-next-line no-console
      console.error("[ui] naverCandidates failed", e);
      setCandidatesError(e instanceof Error ? e.message : "후보를 불러오지 못했습니다.");
      setSelectedRow((prev) => prev ?? { product, result, candidates: [] });
    } finally {
      setCandidatesLoading(false);
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="sticky" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flex: 1 }}>
            파마스퀘어 최저가 트래킹
          </Typography>
          <Button
            color="inherit"
            sx={{ mr: 1 }}
            onClick={() => void downloadUploadTemplate()}
          >
            양식 다운로드
          </Button>
          <Button
            color="inherit"
            startIcon={<DeleteIcon />}
            sx={{ mr: 1 }}
            onClick={() => {
              setClearAllOpen(true);
              setClearAllText("");
            }}
          >
            전체 삭제
          </Button>
          <Button
            component="label"
            color="inherit"
            sx={{ mr: 1 }}
          >
            엑셀 업로드
            <input
              hidden
              type="file"
              accept=".xlsx"
              onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
            />
          </Button>
          <Button
            color="inherit"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
          >
            상품 추가
          </Button>
        </Toolbar>
      </AppBar>

      <Container sx={{ py: 3 }}>
        {listError ? (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => void loadProducts()}>
                다시 시도
              </Button>
            }
          >
            {listError}
          </Alert>
        ) : null}
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab value="dashboard" label="대시보드" />
          <Tab value="products" label="상품" />
        </Tabs>

        {tab === "dashboard" ? (
          <Stack spacing={2}>
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="space-between">
              <Stack spacing={0.5}>
                <Typography variant="subtitle1">가격 조정 대시보드</Typography>
                <Typography variant="caption" color="text.secondary">
                  비교 기준: 네이버 실구매가(배송비 포함)
                </Typography>
              </Stack>
              <Button
                variant="contained"
                startIcon={<RefreshIcon />}
                disabled={loading}
                onClick={() => void refreshAll()}
              >
                전체 가격 갱신
              </Button>
            </Stack>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>상품명</TableCell>
                    <TableCell align="right">우리 판매가</TableCell>
                    <TableCell align="right">네이버 최저가</TableCell>
                    <TableCell align="right">배송비</TableCell>
                    <TableCell align="right">배송비 포함가</TableCell>
                    <TableCell align="right">추천 가격</TableCell>
                    <TableCell align="right">가격 차이</TableCell>
                    <TableCell align="center">상태</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRows.map(({ product, result, ourPrice, diff, status, recommended }) => {
                    const naverPrice = result?.selected?.price ?? null;
                    const shippingFee = result?.selected?.shippingFee ?? null;
                    const effectivePrice = result?.selected?.effectivePrice ?? null;

                    return (
                      <TableRow
                        key={product.id}
                        hover
                        sx={{
                          cursor: "pointer",
                          "&:hover": { bgcolor: "action.hover" }
                        }}
                        onClick={() => void openCandidates(product, result)}
                      >
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {product.name}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{money(ourPrice)}</TableCell>
                        <TableCell align="right">{money(naverPrice)}</TableCell>
                        <TableCell align="right">{money(shippingFee)}</TableCell>
                        <TableCell align="right">{money(effectivePrice)}</TableCell>
                        <TableCell align="right">{money(recommended)}</TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ color: diffColor(diff, effectivePrice), fontWeight: 700 }}>
                            {money(diff)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center">{statusChip(status)}</TableCell>
                      </TableRow>
                    );
                  })}

                  {filteredRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8}>
                        <Typography color="text.secondary">
                          표시할 데이터가 없습니다. 필터를 변경하거나 “전체 가격 갱신”을 실행하세요.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography variant="subtitle1">상품 목록</Typography>
            <List>
              {products.map((p) => (
                <ListItem
                  key={p.id}
                  divider
                  disablePadding
                  secondaryAction={
                    <Stack direction="row" spacing={0.5}>
                      <IconButton
                        edge="end"
                        aria-label="edit"
                        onClick={() => {
                          setEditingProduct(p);
                          setEditOpen(true);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        edge="end"
                        aria-label="delete"
                        onClick={async () => {
                          await backend.deleteProduct(p.id);
                          await loadProducts();
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Stack>
                  }
                >
                  <ListItemButton
                    selected={p.id === selectedProductId}
                    onClick={() => setSelectedProductId(p.id)}
                  >
                    <ListItemText
                      primary={p.name}
                      secondary={`업데이트 ${new Date(p.updatedAt).toLocaleString()}`}
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Stack>
        )}
      </Container>

      <CreateProductDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onNotify={(msg) => notify(msg, "error")}
        onCreated={async () => {
          setCreateOpen(false);
          await loadProducts();
        }}
      />

      <Dialog
        open={clearAllOpen}
        onClose={() => {
          if (clearAllBusy) return;
          setClearAllOpen(false);
          setClearAllText("");
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>전체 삭제</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            모든 상품과 가격 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
          </Alert>
          <Typography variant="body2" sx={{ mb: 1 }}>
            계속하려면 아래 입력칸에 <b>DELETE</b>를 입력하세요.
          </Typography>
          <TextField
            fullWidth
            value={clearAllText}
            onChange={(e) => setClearAllText(e.target.value)}
            placeholder="DELETE"
            disabled={clearAllBusy}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (clearAllBusy) return;
              setClearAllOpen(false);
              setClearAllText("");
            }}
          >
            취소
          </Button>
          <Button
            variant="contained"
            color="error"
            disabled={clearAllBusy || clearAllText.trim() !== "DELETE"}
            onClick={() => void clearAllProducts()}
          >
            {clearAllBusy ? "삭제 중..." : "삭제 실행"}
          </Button>
        </DialogActions>
      </Dialog>

      <EditProductDialog
        open={editOpen}
        product={editingProduct}
        onClose={() => {
          setEditOpen(false);
          setEditingProduct(null);
        }}
        onNotify={(msg) => notify(msg, "error")}
        onSaved={async () => {
          setEditOpen(false);
          setEditingProduct(null);
          await loadProducts();
        }}
      />

      <Modal
        open={candidatesOpen}
        onClose={() => {
          setCandidatesOpen(false);
          setSelectedProductId(null);
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "90vw",
            maxWidth: "1200px",
            height: "80vh",
            overflow: "auto",
            p: 2
          }}
        >
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6">{selectedRow?.product.name ?? "후보 리스트"}</Typography>
                <Typography variant="caption" color="text.secondary">
                  클릭한 상품의 네이버 후보를 보여줍니다.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button
                  onClick={() => {
                    setCandidatesOpen(false);
                    setSelectedProductId(null);
                  }}
                >
                  닫기
                </Button>
              </Stack>
            </Stack>

            {candidatesLoading ? (
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 3 }}>
                <CircularProgress size={22} />
                <Typography color="text.secondary">후보를 불러오는 중...</Typography>
              </Stack>
            ) : (
              <>
                {candidatesError ? (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {candidatesError}
                  </Alert>
                ) : null}

                <Stack direction="row" spacing={1} sx={{ mb: 1 }} alignItems="center">
                  {(() => {
                    const our = selectedRow?.product.ourPrice ?? selectedRow?.result?.ourPrice ?? null;
                    const eff = selectedRow?.result?.selected?.effectivePrice ?? null;
                    const st = computeStatus(our, eff);
                    const d = our != null && eff != null ? our - eff : null;
                    return (
                      <>
                        {statusChip(st)}
                        <Typography variant="body2" color="text.secondary">
                          네이버 기준가 {money(eff)}원 / 배송비 포함 기준 / 우리 가격 차이 {money(d)}원
                        </Typography>
                      </>
                    );
                  })()}
                </Stack>

                {(selectedRow?.candidates?.length ?? 0) === 0 ? (
                  <Paper variant="outlined" sx={{ p: 2 }}>
                    <Typography color="text.secondary">
                      {selectedRow?.result?.message ? `데이터 없음 · ${selectedRow.result.message}` : "데이터 없음"}
                    </Typography>
                  </Paper>
                ) : (
                  <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{ maxHeight: "calc(80vh - 190px)", overflow: "auto" }}
                  >
                    <Table size="small" stickyHeader sx={{ tableLayout: "auto" }}>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ minWidth: 90 }}>포함 여부</TableCell>
                          <TableCell sx={{ minWidth: 160 }}>판매처</TableCell>
                          <TableCell sx={{ width: "60%" }}>상품명</TableCell>
                          <TableCell sx={{ minWidth: 160 }}>누락 단어</TableCell>
                          <TableCell align="right" sx={{ minWidth: 110 }}>
                            상품가
                          </TableCell>
                          <TableCell align="right" sx={{ minWidth: 90 }}>
                            배송비
                          </TableCell>
                          <TableCell align="right" sx={{ minWidth: 120 }}>
                            배송비 포함가
                          </TableCell>
                          <TableCell align="center" sx={{ minWidth: 86 }}>
                            링크
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {(() => {
                          const sorted = (selectedRow?.candidates ?? [])
                            .slice()
                            .sort((a, b) => {
                              // 8. 모달 정렬: PASSED(포함) 먼저, 그 다음 배송비 포함가 낮은 순
                              if (a.isPassed !== b.isPassed) return a.isPassed ? -1 : 1;
                              return a.effectivePrice - b.effectivePrice;
                            });
                          const minEffectivePassed = sorted.find((c) => c.isPassed)?.effectivePrice ?? null;

                          return sorted.map((c, idx) => {
                            const highlight =
                              minEffectivePassed != null && c.isPassed && c.effectivePrice === minEffectivePassed;

                            return (
                              <TableRow
                                key={`${idx}-${c.mallName}-${c.effectivePrice}`}
                                hover
                                sx={highlight ? { bgcolor: "action.selected" } : undefined}
                              >
                                <TableCell>
                                  <Tooltip
                                    title={
                                      c.isPassed
                                        ? "포함"
                                        : c.excludedMessage || excludedReasonKo(c.excludedReason) || "제외"
                                    }
                                    arrow
                                  >
                                    <Box component="span" sx={{ cursor: "help" }}>
                                      {c.isPassed ? "포함" : "제외"}
                                    </Box>
                                  </Tooltip>
                                </TableCell>
                                <TableCell sx={{ wordBreak: "keep-all", lineHeight: 1.4 }}>
                                  {c.mallName}
                                </TableCell>
                                <TableCell
                                  sx={{
                                    wordBreak: "keep-all",
                                    lineHeight: 1.4,
                                    whiteSpace: "normal",
                                    overflowWrap: "normal"
                                  }}
                                >
                                  <Box
                                    sx={{
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden"
                                    }}
                                  >
                                    {c.title}
                                  </Box>
                                </TableCell>
                                <TableCell sx={{ wordBreak: "keep-all", lineHeight: 1.4 }}>
                                  {c.missingTokens && c.missingTokens.length > 0 ? c.missingTokens.join(", ") : "-"}
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                    {money(c.price)}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                    {money(c.shippingFee)}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                    {money(c.effectivePrice)}
                                  </Typography>
                                </TableCell>
                                <TableCell align="center">
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    component="a"
                                    href={c.link}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    sx={{
                                      minWidth: 56,
                                      "&:hover": { borderColor: "primary.main", color: "primary.main" }
                                    }}
                                  >
                                    보기
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          });
                        })()}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </>
            )}
          </Paper>
        </Box>
      </Modal>

      <Snackbar
        open={uploadSnackbarOpen}
        autoHideDuration={5000}
        onClose={() => setUploadSnackbarOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={toastSeverity} sx={{ width: "100%" }}>
          {uploadSnackbarMsg}
        </Alert>
      </Snackbar>
    </Box>
  );
}

/** "79,000" / "79000원" / 공백 혼입 등 → 양수만 추려 파싱 */
function parseOurPriceInput(raw: string): number | null {
  const digits = String(raw ?? "")
    .replace(/[,]/g, "")
    .replace(/[^\d.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function CreateProductDialog({
  open,
  onClose,
  onCreated,
  onNotify
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onNotify: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [ourPrice, setOurPrice] = useState<string>("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) {
      onNotify("상품명을 입력하세요.");
      return;
    }
    const ourPriceNum = parseOurPriceInput(ourPrice);
    if (ourPriceNum == null) {
      onNotify("우리 판매가에 올바른 숫자를 입력하세요. (예: 79000, 79,000, 79000원)");
      return;
    }
    setSaving(true);
    try {
      await backend.upsertProduct({
        name,
        ourPrice: ourPriceNum,
        searchKeyword: name,
        excludeKeyword: [],
        competitors: []
      });
      setName("");
      setOurPrice("");
      onCreated();
    } catch (e) {
      onNotify(e instanceof Error ? `저장 실패: ${e.message}` : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>상품 추가</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="상품명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <TextField
            label="우리 판매가"
            value={ourPrice}
            onChange={(e) => setOurPrice(e.target.value)}
            placeholder="예: 79,000"
            inputMode="numeric"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving}>
          저장
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function EditProductDialog({
  open,
  product,
  onClose,
  onSaved,
  onNotify
}: {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
  onNotify: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [ourPrice, setOurPrice] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? "");
    setOurPrice(product?.ourPrice != null ? String(product.ourPrice) : "");
  }, [open, product]);

  async function save() {
    if (!product?.id) return;
    if (!name.trim()) {
      onNotify("상품명을 입력하세요.");
      return;
    }
    const ourPriceNum = parseOurPriceInput(ourPrice);
    if (ourPriceNum == null) {
      onNotify("우리 판매가에 올바른 숫자를 입력하세요. (예: 79000, 79,000, 79000원)");
      return;
    }

    setSaving(true);
    try {
      await backend.upsertProduct({
        id: product.id,
        name,
        ourPrice: ourPriceNum,
        searchKeyword: name,
        excludeKeyword: product.excludeKeyword ?? [],
        competitors: []
      });
      onSaved();
    } catch (e) {
      onNotify(e instanceof Error ? `저장 실패: ${e.message}` : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>상품 수정</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="상품명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <TextField
            label="우리 판매가"
            value={ourPrice}
            onChange={(e) => setOurPrice(e.target.value)}
            placeholder="예: 79,000"
            inputMode="numeric"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button variant="contained" onClick={() => void save()} disabled={saving || !product?.id}>
          저장
        </Button>
      </DialogActions>
    </Dialog>
  );
}

