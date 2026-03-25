import { Router, type IRouter } from "express";
import healthRouter from "./health";
import comicsRouter from "./comics";
import ratingsRouter from "./ratings";
import rankingRouter from "./ranking";
import historyRouter from "./history";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/comics", comicsRouter);
router.use("/ratings", ratingsRouter);
router.use("/ranking", rankingRouter);
router.use("/history", historyRouter);

export default router;
