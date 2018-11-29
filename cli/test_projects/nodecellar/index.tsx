import Adapt from "@usys/adapt";

import Nodecellar from "./app";
import awsStyle from "./aws";
import k8sStyle from "./k8s";
import localStyle from "./local";

const app = <Nodecellar />;

Adapt.stack("dev", app, localStyle);
Adapt.stack("aws", app, awsStyle);
Adapt.stack("k8s", app, k8sStyle);
