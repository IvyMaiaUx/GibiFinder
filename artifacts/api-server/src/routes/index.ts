import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gibiRouter from "./gibi";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gibiRouter);

export default router;
