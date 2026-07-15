import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gibiRouter from "./gibi";
import providersRouter from "./providers";
import imageProxyRouter from "./imageProxy";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gibiRouter);
router.use(providersRouter);
router.use(imageProxyRouter);

export default router;
